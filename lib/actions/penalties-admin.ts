"use server";

import { revalidatePath } from "next/cache";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getInstances } from "@/lib/services/schedule-store";
import type { PenaltyReason, PenaltyResolution, ClassType } from "@/types/domain";
import { isRealUser } from "@/lib/utils/is-real-user";
import { savePenaltyToDB, updatePenaltyInDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { requireRole } from "@/lib/auth";

const VALID_REASONS = new Set<string>(["late_cancel", "no_show"]);
const VALID_RESOLUTIONS = new Set<string>(["credit_deducted", "waived", "monetary_pending"]);

export async function updatePenaltyResolution(
  penaltyId: string,
  resolution: PenaltyResolution
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  if (!penaltyId) return { success: false, error: "Missing penalty ID" };

  if (!VALID_RESOLUTIONS.has(resolution)) {
    return { success: false, error: "Invalid resolution" };
  }

  const svc = getPenaltyService();
  const result = svc.updateResolution(penaltyId, resolution);

  if (!result) return { success: false, error: "Penalty not found" };

  if (result && isRealUser(result.studentId)) {
    await updatePenaltyInDB(penaltyId, { resolution });
  }

  revalidatePath("/penalties");
  return { success: true };
}

export async function updatePenaltyNotesAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  const penaltyId = formData.get("penaltyId") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!penaltyId) return { success: false, error: "Missing penalty ID" };

  const svc = getPenaltyService();
  const result = svc.updateNotes(penaltyId, notes);

  if (!result) return { success: false, error: "Penalty not found" };

  if (result && isRealUser(result.studentId)) {
    await updatePenaltyInDB(penaltyId, { notes });
  }

  revalidatePath("/penalties");
  return { success: true };
}

export async function createPenaltyAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  const studentId = (formData.get("studentId") as string)?.trim();
  const studentName = (formData.get("studentName") as string)?.trim();
  const bookableClassId = (formData.get("bookableClassId") as string)?.trim();
  const classTitle = (formData.get("classTitle") as string)?.trim();
  const classDate = (formData.get("classDate") as string)?.trim();
  const reason = formData.get("reason") as string;
  const amountCents = Number(formData.get("amountCents"));
  const resolution = formData.get("resolution") as string;
  const bookingId = (formData.get("bookingId") as string)?.trim() || null;
  const subscriptionId = (formData.get("subscriptionId") as string)?.trim() || null;
  const creditDeducted = Number(formData.get("creditDeducted") || "0");
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!studentId || !studentName) return { success: false, error: "Student is required" };
  if (!bookableClassId || !classTitle) return { success: false, error: "Class is required" };
  if (!classDate || !/^\d{4}-\d{2}-\d{2}$/.test(classDate)) {
    return { success: false, error: "Valid class date (YYYY-MM-DD) is required" };
  }
  if (!VALID_REASONS.has(reason)) return { success: false, error: "Invalid reason" };
  if (isNaN(amountCents) || amountCents < 0) return { success: false, error: "Invalid amount" };
  if (!VALID_RESOLUTIONS.has(resolution)) return { success: false, error: "Invalid resolution" };
  if (isNaN(creditDeducted) || creditDeducted < 0) {
    return { success: false, error: "Credits deducted must be non-negative" };
  }

  const svc = getPenaltyService();
  const result = svc.addPenalty({
    studentId,
    studentName,
    bookingId,
    bookableClassId,
    classTitle,
    classDate,
    reason: reason as PenaltyReason,
    amountCents,
    resolution: resolution as PenaltyResolution,
    subscriptionId,
    creditDeducted,
    notes,
  });

  if (isRealUser(studentId)) {
    await savePenaltyToDB(result);
  }

  revalidatePath("/penalties");
  return { success: true };
}

/** Dev-only: delete a penalty from the in-memory store. */
export async function deletePenaltyAction(
  penaltyId: string
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  if (process.env.NODE_ENV !== "development") {
    return { success: false, error: "Not available in production" };
  }
  if (!penaltyId) return { success: false, error: "Missing penalty ID" };

  const svc = getPenaltyService();
  const deleted = svc.deletePenalty(penaltyId);
  if (!deleted) return { success: false, error: "Penalty not found" };
  revalidatePath("/penalties");
  return { success: true };
}

/**
 * Dev/admin-only: scan attendance absences and create missing penalties
 * using CURRENT settings. Does not affect existing penalties.
 */
export async function backfillPenaltiesAction(): Promise<{
  success: boolean;
  created: number;
  skipped: number;
  error?: string;
}> {
  await ensureOperationalDataHydrated();
  if (process.env.NODE_ENV !== "development") {
    return { success: false, created: 0, skipped: 0, error: "Not available in production" };
  }

  const attendanceSvc = getAttendanceService();
  const penaltySvc = getPenaltyService();
  const classMap = new Map(getInstances().map((bc) => [bc.id, bc]));

  const absences = attendanceSvc
    .getAllRecords()
    .filter((r) => r.status === "absent");

  let created = 0;
  let skipped = 0;

  for (const a of absences) {
    const alreadyExists = penaltySvc
      .getAllPenalties()
      .some(
        (p) =>
          p.bookableClassId === a.bookableClassId &&
          p.studentId === a.studentId &&
          p.reason === "no_show"
      );

    if (alreadyExists) {
      skipped++;
      continue;
    }

    const bc = classMap.get(a.bookableClassId);
    const classType: ClassType = (bc?.classType as ClassType) ?? "class";

    const outcome = penaltySvc.assessNoShowPenalty({
      studentId: a.studentId,
      studentName: a.studentName,
      bookingId: a.bookingId ?? "",
      bookableClassId: a.bookableClassId,
      classTitle: a.classTitle,
      classDate: a.date,
      classType,
      subscriptions: [],
      classContext: {
        danceStyleId: bc?.styleId ?? null,
        level: bc?.level ?? null,
      },
    });

    if (outcome.penaltyCreated) created++;
    else skipped++;
  }

  revalidatePath("/penalties");
  revalidatePath("/attendance");
  return { success: true, created, skipped };
}

/** Dev-only: remove all penalties from the store. */
export async function clearAllPenaltiesAction(): Promise<{
  success: boolean;
  cleared: number;
  error?: string;
}> {
  await ensureOperationalDataHydrated();
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const svc = getPenaltyService();
  const cleared = svc.clearAll();
  revalidatePath("/penalties");
  return { success: true, cleared };
}
