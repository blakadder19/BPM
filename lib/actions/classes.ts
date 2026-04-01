"use server";

import { revalidatePath } from "next/cache";
import {
  getTemplate,
  createTemplate,
  updateTemplate,
  toggleTemplateActive,
  clearAllTemplates,
  deleteTemplate,
} from "@/lib/services/class-store";
import {
  createInstance,
  getInstance,
  updateInstance,
  updateInstanceStatus,
  getInstances,
  generateFromTemplates,
  previewGeneration,
  clearAllInstances,
  deleteInstance,
} from "@/lib/services/schedule-store";
import {
  createAssignment,
  updateAssignment,
  getActiveAssignmentForClass,
  toggleAssignmentActive,
  deleteAssignment,
  clearAllAssignments,
} from "@/lib/services/teacher-store";
import {
  createTeacher,
  updateTeacher,
  toggleTeacherActive,
  deleteTeacher,
} from "@/lib/services/teacher-roster-store";
import {
  createTemplateToDB,
  saveTemplateToDB,
  createInstanceInDB,
  saveInstanceToDB,
  updateInstanceStatusInDB,
  deleteInstanceFromDB,
} from "@/lib/supabase/schedule-persistence";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { getTermRepo, getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription as repoUpdateSub } from "@/lib/services/subscription-service";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { saveBookingToDB, deleteWaitlistFromDB, deleteAttendanceFromDB } from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import type { ClassCancellationNotice } from "@/lib/services/class-cancellation-store";
import { classCancelledEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import { findTermForDate } from "@/lib/domain/term-rules";
import { requireRole } from "@/lib/auth";
import type { ClassType, InstanceStatus } from "@/types/domain";
import { isClassEnded } from "@/lib/domain/datetime";
import { BLOCKED_SENTINEL } from "@/lib/constants/teacher-assignment";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function dbError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("duplicate key") || raw.includes("unique constraint") || raw.includes("already exists")) {
    if (raw.includes("class_instances") || raw.includes("schedule")) {
      return "A class instance with this combination of class, date, and time already exists.";
    }
    return "A record with these details already exists. Please check for duplicates.";
  }
  if (raw.includes("violates foreign key") || raw.includes("referenced")) {
    return "This record is linked to other data and cannot be removed. Try deactivating it instead.";
  }
  if (raw.includes("violates not-null") || raw.includes("null value in column")) {
    return "A required field is missing. Please check the form and try again.";
  }
  return raw;
}

const VALID_CLASS_TYPES = new Set<string>(["class", "social", "student_practice"]);
const VALID_STATUSES = new Set<string>(["scheduled", "open", "closed", "cancelled"]);

function revalidateClasses() {
  revalidatePath("/classes");
  revalidatePath("/classes/bookable");
  revalidatePath("/classes/teachers");
}

function syncClassMap() {
  const svc = getBookingService();
  const instances = getInstances();
  const styles = getDanceStyles();
  svc.refreshClasses(
    instances.map((bc) => {
      const style = bc.styleName ? styles.find((s) => s.name === bc.styleName) : null;
      return {
        id: bc.id,
        title: bc.title,
        classType: bc.classType,
        styleName: bc.styleName,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
        status: bc.status,
        date: bc.date,
        startTime: bc.startTime,
        endTime: bc.endTime,
        maxCapacity: bc.maxCapacity,
        leaderCap: bc.leaderCap,
        followerCap: bc.followerCap,
        location: bc.location,
      };
    })
  );
}

/**
 * Cancel all active bookings/waitlist for a class and revert credits.
 * Called when admin deletes or cancels a class instance.
 */
type CascadeNotice = Omit<ClassCancellationNotice, "id" | "createdAt">;

async function cascadeCancelBookingsForClass(
  classId: string,
  classTitle: string,
  classDate: string,
  startTime: string
): Promise<CascadeNotice[]> {
  await ensureOperationalDataHydrated();
  syncClassMap();

  const svc = getBookingService();
  const attSvc = getAttendanceService();
  const notices: CascadeNotice[] = [];

  const activeBookings = svc.bookings.filter(
    (b) =>
      b.bookableClassId === classId &&
      (b.status === "confirmed" || b.status === "checked_in")
  );

  for (const booking of activeBookings) {
    booking.status = "cancelled";
    booking.cancelledAt = new Date().toISOString();
    booking.adminNote = "academy_cancelled";

    let creditReverted = false;
    if (booking.source === "birthday") {
      const { unmarkBirthdayClassUsed } = await import("@/lib/services/birthday-benefit-store");
      await unmarkBirthdayClassUsed(booking.studentId, new Date().getFullYear());
      creditReverted = true;
    } else if (booking.subscriptionId) {
      const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
      if (sub) {
        if (sub.productType === "membership" && sub.classesPerTerm !== null && sub.classesUsed > 0) {
          await repoUpdateSub(sub.id, { classesUsed: sub.classesUsed - 1 });
          creditReverted = true;
        } else if (sub.remainingCredits !== null) {
          await repoUpdateSub(sub.id, { remainingCredits: sub.remainingCredits + 1 });
          creditReverted = true;
        }
      }
    }

    if (isRealUser(booking.studentId)) {
      await saveBookingToDB(booking);
    }

    notices.push({
      studentId: booking.studentId,
      studentName: booking.studentName,
      classTitle,
      classDate,
      startTime,
      creditReverted,
    });
  }

  // Remove waitlist entries
  const waitlistEntries = svc.waitlist.filter(
    (w) => w.bookableClassId === classId && w.status === "waiting"
  );
  for (const wl of waitlistEntries) {
    wl.status = "cancelled" as never;
    if (isRealUser(wl.studentId)) {
      await deleteWaitlistFromDB(wl.id);
    }
  }
  svc.waitlist = svc.waitlist.filter(
    (w) => !(w.bookableClassId === classId && w.status === ("cancelled" as never))
  );

  // Remove attendance records for this class
  const attRecords = attSvc.records.filter((r) => r.bookableClassId === classId);
  for (const att of attRecords) {
    if (isRealUser(att.studentId)) {
      await deleteAttendanceFromDB(att.id);
    }
  }
  attSvc.records = attSvc.records.filter((r) => r.bookableClassId !== classId);

  return notices;
}

// ── Template actions ────────────────────────────────────────

export async function createTemplateAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();

  const title = (formData.get("title") as string)?.trim();
  const classType = formData.get("classType") as string;
  const styleName = (formData.get("styleName") as string)?.trim() || null;
  const styleId = (formData.get("styleId") as string)?.trim() || null;
  const level = (formData.get("level") as string)?.trim() || null;
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  const maxCapacity = formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null;
  const leaderCap = formData.get("leaderCap") ? Number(formData.get("leaderCap")) : null;
  const followerCap = formData.get("followerCap") ? Number(formData.get("followerCap")) : null;
  const location = (formData.get("location") as string)?.trim() || "Studio A";
  const isActive = formData.get("isActive") === "true";
  const termId = (formData.get("termId") as string)?.trim() || null;
  const termBound = termId ? formData.get("termBound") === "true" : false;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!title) return { success: false, error: "Title is required" };
  if (!VALID_CLASS_TYPES.has(classType)) return { success: false, error: "Invalid class type" };
  if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) return { success: false, error: "Invalid day of week" };
  if (!startTime || !endTime) return { success: false, error: "Start and end time required" };
  if (endTime <= startTime) return { success: false, error: "End time must be after start time" };

  // UI uses 1=Mon..7=Sun; DB CHECK constraint uses 0=Sun..6=Sat
  const dbDayOfWeek = dayOfWeek === 7 ? 0 : dayOfWeek;

  const templateData = {
    title,
    classType: classType as ClassType,
    styleName, styleId, level, dayOfWeek: dbDayOfWeek,
    startTime, endTime, maxCapacity, leaderCap, followerCap,
    location, isActive, termBound, termId, notes,
  };

  try {
    const dbTpl = await createTemplateToDB({
      ...templateData,
      classType: templateData.classType as "class" | "social" | "student_practice",
    });
    const memTpl = createTemplate(templateData);
    if (dbTpl) memTpl.id = dbTpl.id;
  } catch (err) {
    console.error("[createTemplateAction] DB write failed:", err);
    return { success: false, error: `Failed to save template: ${dbError(err)}` };
  }

  revalidateClasses();
  return { success: true };
}

export async function updateTemplateAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing template ID" };

  const title = (formData.get("title") as string)?.trim();
  const classType = formData.get("classType") as string;
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();

  if (!title) return { success: false, error: "Title is required" };
  if (classType && !VALID_CLASS_TYPES.has(classType)) return { success: false, error: "Invalid class type" };
  if (startTime && endTime && endTime <= startTime) return { success: false, error: "End time must be after start time" };

  const rawDay = Number(formData.get("dayOfWeek"));
  const dbDay = rawDay === 7 ? 0 : rawDay;

  const patch = {
    title,
    classType: classType as ClassType,
    styleName: (formData.get("styleName") as string)?.trim() || null,
    styleId: (formData.get("styleId") as string)?.trim() || null,
    level: (formData.get("level") as string)?.trim() || null,
    dayOfWeek: dbDay,
    startTime, endTime,
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : null,
    leaderCap: formData.get("leaderCap") ? Number(formData.get("leaderCap")) : null,
    followerCap: formData.get("followerCap") ? Number(formData.get("followerCap")) : null,
    location: (formData.get("location") as string)?.trim() || "Studio A",
    isActive: formData.get("isActive") === "true",
    termId: (formData.get("termId") as string)?.trim() || null,
    termBound: ((formData.get("termId") as string)?.trim()) ? formData.get("termBound") === "true" : false,
  };

  const dbPatch: Record<string, unknown> = { ...patch };
  delete dbPatch.notes;

  const existingTemplate = getTemplate(id);
  if (!existingTemplate) return { success: false, error: "Template not found" };
  const oldTermId = existingTemplate.termId ?? null;
  const oldTermBound = existingTemplate.termBound ?? false;

  try {
    await saveTemplateToDB(id, dbPatch);
  } catch (err) {
    console.error("[updateTemplateAction] DB write failed:", err);
    return { success: false, error: `Failed to save template: ${dbError(err)}` };
  }

  const updated = updateTemplate(id, patch);
  if (!updated) return { success: false, error: "Template not found in memory" };

  const termChanged = patch.termId !== oldTermId || patch.termBound !== oldTermBound;
  if (termChanged) {
    const today = new Date().toISOString().slice(0, 10);
    const inherited = getInstances().filter(
      (i) =>
        i.classId === id &&
        i.date >= today &&
        (i.termId ?? null) === oldTermId &&
        (i.termBound ?? false) === oldTermBound
    );

    let newTerm: { id: string; startDate: string; endDate: string } | null = null;
    if (patch.termId) {
      const allTerms = await getTermRepo().getAll();
      newTerm = allTerms.find((t) => t.id === patch.termId) ?? null;
    }

    for (const inst of inherited) {
      if (newTerm && (inst.date < newTerm.startDate || inst.date > newTerm.endDate)) {
        updateInstance(inst.id, { termId: null, termBound: false });
        try { await saveInstanceToDB(inst.id, { termId: null, termBound: false }); } catch { /* best effort */ }
      } else {
        updateInstance(inst.id, { termId: patch.termId ?? null, termBound: patch.termBound });
        try { await saveInstanceToDB(inst.id, { termId: patch.termId ?? null, termBound: patch.termBound }); } catch { /* best effort */ }
      }
    }
  }

  revalidateClasses();
  return { success: true };
}

export async function toggleTemplateActiveAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!id) return { success: false, error: "Missing template ID" };

  const existing = getTemplate(id);
  if (!existing) return { success: false, error: "Template not found" };

  try {
    await saveTemplateToDB(id, { isActive: !existing.isActive });
  } catch (err) {
    console.error("[toggleTemplateActiveAction] DB write failed:", err);
    return { success: false, error: `Failed to toggle template: ${dbError(err)}` };
  }

  toggleTemplateActive(id);
  revalidateClasses();
  return { success: true };
}

// ── Schedule instance actions ───────────────────────────────

export async function createInstanceAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();

  const templateId = (formData.get("templateId") as string)?.trim() || null;
  const title = (formData.get("title") as string)?.trim();
  const classType = formData.get("classType") as string;
  const date = (formData.get("date") as string)?.trim();
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  const status = (formData.get("status") as string) || "scheduled";

  if (!title) return { success: false, error: "Title is required" };
  if (!VALID_CLASS_TYPES.has(classType)) return { success: false, error: "Invalid class type" };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: "Valid date required" };
  if (!startTime || !endTime) return { success: false, error: "Times required" };
  if (!VALID_STATUSES.has(status)) return { success: false, error: "Invalid status" };

  if (isClassEnded(date, endTime)) {
    return {
      success: false,
      error: "This class instance has already ended. Create a future or live class instead, or use attendance/history for corrections.",
    };
  }

  const tpl = templateId ? getTemplate(templateId) : null;

  const instanceLevel = (formData.get("level") as string)?.trim() || tpl?.level || null;
  const formTermBound = formData.get("termBound");
  const resolvedTermBound = formTermBound !== null
    ? formTermBound === "true"
    : (tpl?.termBound ?? false);
  let resolvedTermId = (formData.get("termId") as string)?.trim() || tpl?.termId || null;

  if (resolvedTermId) {
    const allTerms = await getTermRepo().getAll();
    const linkedTerm = allTerms.find((t) => t.id === resolvedTermId);
    if (linkedTerm && (date < linkedTerm.startDate || date > linkedTerm.endDate)) {
      return { success: false, error: "This class date falls outside the selected term. Choose a date within the term period." };
    }
  } else if (resolvedTermBound) {
    const allTerms = await getTermRepo().getAll();
    const matchedTerm = findTermForDate(allTerms, date);
    if (matchedTerm) {
      resolvedTermId = matchedTerm.id;
    } else {
      return { success: false, error: "Term enforcement is enabled but no defined term covers the selected date. Please check the date or create the matching term first." };
    }
  }

  const instanceData = {
    classId: templateId,
    title,
    classType: classType as ClassType,
    styleName: (formData.get("styleName") as string)?.trim() || tpl?.styleName || null,
    styleId: (formData.get("styleId") as string)?.trim() || tpl?.styleId || null,
    level: (formData.get("level") as string)?.trim() || tpl?.level || null,
    date, startTime, endTime,
    maxCapacity: formData.get("maxCapacity") ? Number(formData.get("maxCapacity")) : tpl?.maxCapacity ?? null,
    leaderCap: formData.get("leaderCap") ? Number(formData.get("leaderCap")) : tpl?.leaderCap ?? null,
    followerCap: formData.get("followerCap") ? Number(formData.get("followerCap")) : tpl?.followerCap ?? null,
    location: (formData.get("location") as string)?.trim() || tpl?.location || "Studio A",
    status: status as InstanceStatus,
    notes: (formData.get("notes") as string)?.trim() || null,
    termBound: resolvedTermBound,
    termId: resolvedTermId,
  };

  try {
    const dbInst = await createInstanceInDB({
      ...instanceData,
      classType: instanceData.classType as "class" | "social" | "student_practice",
    });
    const memInst = createInstance(instanceData);
    if (dbInst) memInst.id = dbInst.id;
  } catch (err) {
    return { success: false, error: `Failed to save instance: ${dbError(err)}` };
  }

  revalidateClasses();
  return { success: true };
}

export async function updateInstanceAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing instance ID" };

  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  if (startTime && endTime && endTime <= startTime) {
    return { success: false, error: "End time must be after start time" };
  }

  const patch: Record<string, unknown> = {};
  for (const f of ["title", "date", "startTime", "endTime", "location", "notes", "status"] as const) {
    const v = formData.get(f);
    if (v !== null) patch[f] = (v as string).trim() || null;
  }
  for (const f of ["maxCapacity", "leaderCap", "followerCap"] as const) {
    const v = formData.get(f);
    if (v !== null) patch[f] = v ? Number(v) : null;
  }

  const existing = getInstance(id);
  if (!existing) return { success: false, error: "Instance not found" };

  const formTermId = formData.get("termId");
  const formTermBound = formData.get("termBound");
  if (formTermId !== null) {
    patch.termId = (formTermId as string).trim() || null;
  }
  if (formTermBound !== null) {
    patch.termBound = formTermBound === "true";
    if (!patch.termBound && patch.termId === undefined) patch.termId = null;
  }

  const effectiveTermId = (patch.termId as string | null | undefined) ?? existing.termId;
  const effectiveTermBound = (patch.termBound as boolean | undefined) ?? existing.termBound;
  const finalDate = (patch.date as string) ?? existing.date;

  if (effectiveTermId) {
    const allTerms = await getTermRepo().getAll();
    const linkedTerm = allTerms.find((t) => t.id === effectiveTermId);
    if (linkedTerm && (finalDate < linkedTerm.startDate || finalDate > linkedTerm.endDate)) {
      return { success: false, error: "This class date falls outside the selected term. Choose a date within the term period." };
    }
  } else if (effectiveTermBound) {
    const allTerms = await getTermRepo().getAll();
    const matchedTerm = findTermForDate(allTerms, finalDate);
    if (!matchedTerm) {
      return { success: false, error: "Term enforcement is enabled but no defined term covers the selected date. Please check the date or create the matching term first." };
    }
  }

  try {
    await saveInstanceToDB(id, patch);
  } catch (err) {
    return { success: false, error: `Failed to save instance: ${dbError(err)}` };
  }

  updateInstance(id, patch as Parameters<typeof updateInstance>[1]);
  revalidateClasses();
  return { success: true };
}

export async function updateInstanceStatusAction(
  id: string,
  status: InstanceStatus
): Promise<{ success: boolean; error?: string; affectedStudents?: number }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!id) return { success: false, error: "Missing instance ID" };
  if (!VALID_STATUSES.has(status)) return { success: false, error: "Invalid status" };

  const existing = getInstance(id);
  if (!existing) return { success: false, error: "Instance not found" };

  let affectedStudents = 0;

  if (status === "cancelled" && existing.status !== "cancelled") {
    const notices = await cascadeCancelBookingsForClass(
      id,
      existing.title,
      existing.date,
      existing.startTime
    );
    affectedStudents = notices.length;
    if (notices.length > 0) {
      const events = notices.map((n) =>
        classCancelledEvent({ ...n, classInstanceId: id })
      );
      await dispatchCommEvents(events);
    }
  }

  try {
    await updateInstanceStatusInDB(id, status);
  } catch (err) {
    return { success: false, error: `Failed to update status: ${dbError(err)}` };
  }

  updateInstanceStatus(id, status);
  revalidateClasses();

  if (status === "cancelled") {
    revalidatePath("/bookings");
    revalidatePath("/dashboard");
    revalidatePath("/attendance");
    revalidatePath("/students");
  }

  return { success: true, affectedStudents };
}

export async function setInstanceTeacherOverrideAction(
  instanceId: string,
  teacher1Id: string | null,
  teacher2Id: string | null
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!instanceId) return { success: false, error: "Missing instance ID" };

  const existing = getInstance(instanceId);
  if (!existing) return { success: false, error: "Instance not found" };

  const dbPatch: Record<string, unknown> = {
    teacherOverride1Id: teacher1Id,
    teacherOverride2Id: teacher2Id,
  };

  try {
    await saveInstanceToDB(instanceId, dbPatch);
  } catch (err) {
    return { success: false, error: `Failed to save teacher override: ${dbError(err)}` };
  }

  updateInstance(instanceId, {
    teacherOverride1Id: teacher1Id,
    teacherOverride2Id: teacher2Id,
  });
  revalidateClasses();
  return { success: true };
}

export async function previewGenerateScheduleAction(
  startDate: string,
  endDate: string,
  opts?: { includeInactive?: boolean; overwrite?: boolean }
): Promise<{ success: boolean; toCreate: number; toSkip: number; toOverwrite: number; error?: string }> {
  await requireRole(["admin"]);
  if (!startDate || !endDate) return { success: false, toCreate: 0, toSkip: 0, toOverwrite: 0, error: "Date range required" };
  if (endDate < startDate) return { success: false, toCreate: 0, toSkip: 0, toOverwrite: 0, error: "End date must be after start date" };

  const result = previewGeneration(startDate, endDate, opts);
  return { success: true, ...result };
}

export async function generateScheduleAction(
  startDate: string,
  endDate: string,
  opts?: { includeInactive?: boolean; overwrite?: boolean }
): Promise<{ success: boolean; created: number; skipped: number; overwritten?: number; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!startDate || !endDate) return { success: false, created: 0, skipped: 0, error: "Date range required" };
  if (endDate < startDate) return { success: false, created: 0, skipped: 0, error: "End date must be after start date" };

  const allTerms = await getTermRepo().getAll();
  const termRanges = allTerms.map((t) => ({ id: t.id, startDate: t.startDate, endDate: t.endDate }));
  const beforeIds = new Set(getInstances().map((i) => i.id));
  const result = generateFromTemplates(startDate, endDate, opts, termRanges);

  const newInstances = getInstances().filter((i) => !beforeIds.has(i.id));
  let dbErrors = 0;
  for (const inst of newInstances) {
    try {
      const dbInst = await createInstanceInDB({
        classId: inst.classId,
        title: inst.title,
        classType: inst.classType as "class" | "social" | "student_practice",
        styleName: inst.styleName,
        styleId: inst.styleId,
        level: inst.level,
        date: inst.date,
        startTime: inst.startTime,
        endTime: inst.endTime,
        maxCapacity: inst.maxCapacity,
        leaderCap: inst.leaderCap,
        followerCap: inst.followerCap,
        status: inst.status,
        location: inst.location,
        termBound: inst.termBound,
        termId: inst.termId,
      });
      if (dbInst) inst.id = dbInst.id;
    } catch (err) {
      console.error("[generateScheduleAction] Failed to persist instance:", dbError(err));
      dbErrors++;
    }
  }

  revalidateClasses();
  if (dbErrors > 0) {
    return {
      success: false,
      ...result,
      error: `Generated ${result.created} instances but ${dbErrors} failed to persist to DB. Those will be lost on restart.`,
    };
  }
  return { success: true, ...result };
}

// ── Linked-instance query (for delete-template modal) ──────

export interface LinkedInstance {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  location: string;
  isPast: boolean;
  bookedCount: number;
  waitlistCount: number;
}

export async function getLinkedInstancesAction(
  templateId: string
): Promise<{ upcoming: LinkedInstance[]; past: LinkedInstance[] }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  await ensureOperationalDataHydrated();
  const svc = getBookingService();
  const today = new Date().toISOString().slice(0, 10);
  const all = getInstances()
    .filter((i) => i.classId === templateId)
    .map((i) => ({
      id: i.id,
      title: i.title,
      date: i.date,
      startTime: i.startTime,
      endTime: i.endTime,
      status: i.status,
      location: i.location ?? "",
      isPast: i.date < today,
      bookedCount: svc.getConfirmedBookingsForClass(i.id).length,
      waitlistCount: svc.waitlist.filter((w) => w.bookableClassId === i.id && w.status === "waiting").length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return {
    upcoming: all.filter((i) => !i.isPast),
    past: all.filter((i) => i.isPast),
  };
}

// ── Delete actions ──────────────────────────────────────────

export async function deleteTemplateAction(id: string): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!id) return { success: false, error: "Missing template ID" };

  const tpl = getTemplate(id);
  if (!tpl) return { success: false, error: "Template not found" };

  // Block deletion while any linked instances exist
  const linked = getInstances().filter((i) => i.classId === id);
  if (linked.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const up = linked.filter((i) => i.date >= today).length;
    const past = linked.filter((i) => i.date < today).length;
    const parts: string[] = [];
    if (up > 0) parts.push(`${up} upcoming`);
    if (past > 0) parts.push(`${past} past`);
    return {
      success: false,
      error: `Cannot delete "${tpl.title}" — it still has ${parts.join(" and ")} linked schedule instance${linked.length > 1 ? "s" : ""}. Remove or unlink them first from inside the delete dialog.`,
    };
  }

  if (hasSupabaseConfig() && isUUID(id)) {
    const { createAdminClient } = require("@/lib/supabase/admin");
    const supabase = createAdminClient();

    // Safety: unlink any stale DB-only references that memory might not know about
    await supabase.from("bookable_classes").update({ class_id: null } as never).eq("class_id", id);

    // Clean up cascade-safe dependencies explicitly for robustness
    await supabase.from("teacher_default_assignments").delete().eq("class_id", id);
    await supabase.from("teacher_pairs").delete().eq("class_id", id);

    const { error: deleteErr } = await supabase.from("classes").delete().eq("id", id);
    if (deleteErr) {
      console.error("[deleteTemplateAction] DB delete failed:", deleteErr.message);
      return { success: false, error: `Failed to delete template: ${deleteErr.message}` };
    }
    console.info(`[deleteTemplateAction] template "${tpl.title}" deleted from DB`);
  } else if (hasSupabaseConfig() && !isUUID(id)) {
    console.warn(`[deleteTemplateAction] Template "${tpl.title}" has non-UUID id — skipping DB delete.`);
  }

  deleteTemplate(id);
  revalidateClasses();
  return { success: true };
}

export async function deleteInstanceAction(
  id: string
): Promise<{ success: boolean; error?: string; affectedStudents?: number }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!id) return { success: false, error: "Missing instance ID" };

  const inst = getInstance(id);
  if (!inst) return { success: false, error: "Instance not found" };

  const notices = await cascadeCancelBookingsForClass(
    id,
    inst.title,
    inst.date,
    inst.startTime
  );

  if (notices.length > 0) {
    const events = notices.map((n) =>
      classCancelledEvent({ ...n, classInstanceId: id })
    );
    await dispatchCommEvents(events);
  }

  try {
    await deleteInstanceFromDB(id);
  } catch (err) {
    return { success: false, error: `Failed to delete instance: ${dbError(err)}` };
  }

  deleteInstance(id);
  revalidateClasses();
  revalidatePath("/attendance");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/students");
  return { success: true, affectedStudents: notices.length };
}

// ── Teacher roster actions ──────────────────────────────────

async function getTeacherRepo() {
  const { supabaseTeacherRosterRepo } = require("@/lib/repositories/supabase/teacher-roster-repository");
  return supabaseTeacherRosterRepo;
}

export async function createTeacherAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const fullName = (formData.get("fullName") as string)?.trim();
  if (!fullName) return { success: false, error: "Name is required" };

  const rawCategory = (formData.get("category") as string)?.trim() || null;
  const category = rawCategory as import("@/lib/services/teacher-roster-store").TeacherCategory;

  const data = {
    fullName,
    email: (formData.get("email") as string)?.trim() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    category,
    isActive: formData.get("isActive") !== "false",
  };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getTeacherRepo();
      const dbTeacher = await repo.create(data);
      const teacher = createTeacher(data);
      teacher.id = dbTeacher.id;
    } catch (err) {
      return { success: false, error: `Failed to save teacher: ${dbError(err)}` };
    }
  } else {
    createTeacher(data);
  }

  revalidateClasses();
  return { success: true };
}

export async function updateTeacherAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing teacher ID" };

  const fullName = (formData.get("fullName") as string)?.trim();
  if (!fullName) return { success: false, error: "Name is required" };

  const rawCategory = (formData.get("category") as string)?.trim() || null;
  const category = rawCategory as import("@/lib/services/teacher-roster-store").TeacherCategory;

  const patch = {
    fullName,
    email: (formData.get("email") as string)?.trim() || null,
    phone: (formData.get("phone") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    category,
    isActive: formData.get("isActive") !== "false",
  };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getTeacherRepo();
      await repo.update(id, patch);
    } catch (err) {
      return { success: false, error: `Failed to update teacher: ${dbError(err)}` };
    }
  }

  const result = updateTeacher(id, patch);
  if (!result) return { success: false, error: "Teacher not found" };

  revalidateClasses();
  return { success: true };
}

export async function toggleTeacherActiveAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing teacher ID" };

  const existing = require("@/lib/services/teacher-roster-store").getTeacher(id);
  if (!existing) return { success: false, error: "Teacher not found" };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getTeacherRepo();
      await repo.update(id, { isActive: !existing.isActive });
    } catch (err) {
      return { success: false, error: `Failed to toggle teacher: ${dbError(err)}` };
    }
  }

  toggleTeacherActive(id);
  revalidateClasses();
  return { success: true };
}

export async function deleteTeacherAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing teacher ID" };

  const existing = require("@/lib/services/teacher-roster-store").getTeacher(id);
  if (!existing) return { success: false, error: "Teacher not found" };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getTeacherRepo();
      await repo.delete(id);
    } catch (err) {
      return { success: false, error: `Failed to delete teacher: ${dbError(err)}` };
    }
  }

  deleteTeacher(id);
  revalidateClasses();
  revalidatePath("/classes/teachers");
  return { success: true };
}

// ── Teacher assignment actions ──────────────────────────────

async function getAssignmentRepo() {
  const { supabaseTeacherAssignmentRepo } = require("@/lib/repositories/supabase/teacher-assignment-repository");
  return supabaseTeacherAssignmentRepo;
}

export async function createAssignmentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const classId = (formData.get("classId") as string)?.trim();
  const classTitle = (formData.get("classTitle") as string)?.trim();
  const teacher1Id = (formData.get("teacher1Id") as string)?.trim();
  const teacher2Id = (formData.get("teacher2Id") as string)?.trim() || null;
  const effectiveFrom = (formData.get("effectiveFrom") as string)?.trim();
  const effectiveUntil = (formData.get("effectiveUntil") as string)?.trim() || null;
  const isActive = formData.get("isActive") === "true";

  if (!classId || !classTitle) return { success: false, error: "Class is required" };
  if (!teacher1Id) return { success: false, error: "Teacher 1 is required" };
  if (!effectiveFrom) return { success: false, error: "Effective from date is required" };
  if (effectiveUntil && effectiveUntil < effectiveFrom) {
    return { success: false, error: "Until date must be after from date" };
  }

  const data = { classId, classTitle, teacher1Id, teacher2Id, effectiveFrom, effectiveUntil, isActive };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getAssignmentRepo();
      const dbAssignment = await repo.create(data);
      const assignment = createAssignment(data);
      assignment.id = dbAssignment.id;
    } catch (err) {
      return { success: false, error: `Failed to save assignment: ${dbError(err)}` };
    }
  } else {
    createAssignment(data);
  }

  revalidateClasses();
  return { success: true };
}

export async function updateAssignmentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing assignment ID" };

  const teacher1Id = (formData.get("teacher1Id") as string)?.trim();
  if (!teacher1Id) return { success: false, error: "Teacher 1 is required" };

  const effectiveFrom = (formData.get("effectiveFrom") as string)?.trim();
  const effectiveUntil = (formData.get("effectiveUntil") as string)?.trim() || null;
  if (effectiveUntil && effectiveFrom && effectiveUntil < effectiveFrom) {
    return { success: false, error: "Until date must be after from date" };
  }

  const patch = {
    teacher1Id,
    teacher2Id: (formData.get("teacher2Id") as string)?.trim() || null,
    effectiveFrom,
    effectiveUntil,
    isActive: formData.get("isActive") === "true",
  };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getAssignmentRepo();
      await repo.update(id, patch);
    } catch (err) {
      return { success: false, error: `Failed to update assignment: ${dbError(err)}` };
    }
  }

  const result = updateAssignment(id, patch);
  if (!result) return { success: false, error: "Assignment not found" };

  revalidateClasses();
  return { success: true };
}

export async function toggleAssignmentActiveAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing assignment ID" };

  const existing = require("@/lib/services/teacher-store").getAssignment(id);
  if (!existing) return { success: false, error: "Assignment not found" };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getAssignmentRepo();
      await repo.update(id, { isActive: !existing.isActive });
    } catch (err) {
      return { success: false, error: `Failed to toggle assignment: ${dbError(err)}` };
    }
  }

  toggleAssignmentActive(id);
  revalidateClasses();
  return { success: true };
}

export async function deleteAssignmentAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing assignment ID" };

  const existing = require("@/lib/services/teacher-store").getAssignment(id);
  if (!existing) return { success: false, error: "Assignment not found" };

  if (hasSupabaseConfig()) {
    try {
      const repo = await getAssignmentRepo();
      await repo.delete(id);
    } catch (err) {
      return { success: false, error: `Failed to delete assignment: ${dbError(err)}` };
    }
  }

  deleteAssignment(id);
  revalidateClasses();
  return { success: true };
}

/**
 * Create or update the active default assignment for a class.
 * DB-first: writes to Supabase before updating memory.
 */
export async function saveDefaultAssignmentAction(
  classId: string,
  classTitle: string,
  teacher1Id: string,
  teacher2Id: string | null
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!classId || !classTitle) return { success: false, error: "Class info required" };
  if (!teacher1Id) return { success: false, error: "Teacher 1 is required" };

  const existing = getActiveAssignmentForClass(classId);

  if (existing) {
    if (hasSupabaseConfig()) {
      try {
        const repo = await getAssignmentRepo();
        await repo.update(existing.id, { teacher1Id, teacher2Id });
      } catch (err) {
        return { success: false, error: `Failed to update assignment: ${dbError(err)}` };
      }
    }
    updateAssignment(existing.id, { teacher1Id, teacher2Id });
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const data = { classId, classTitle, teacher1Id, teacher2Id, effectiveFrom: today, effectiveUntil: null, isActive: true };

    if (hasSupabaseConfig()) {
      try {
        const repo = await getAssignmentRepo();
        const dbAssignment = await repo.create(data);
        const assignment = createAssignment(data);
        assignment.id = dbAssignment.id;
      } catch (err) {
        return { success: false, error: `Failed to save assignment: ${dbError(err)}` };
      }
    } else {
      createAssignment(data);
    }
  }

  revalidateClasses();
  return { success: true };
}

/**
 * Bulk set teacher overrides on specific instances.
 * DB-first for each instance.
 */
export async function bulkSetTeacherOverrideAction(
  instanceIds: string[],
  teacher1Id: string | null,
  teacher2Id: string | null
): Promise<{ success: boolean; updated: number; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!instanceIds || instanceIds.length === 0) {
    return { success: false, updated: 0, error: "No instances selected" };
  }

  let updated = 0;
  const errors: string[] = [];

  for (const id of instanceIds) {
    const existing = getInstance(id);
    if (!existing) continue;

    try {
      await saveInstanceToDB(id, { teacherOverride1Id: teacher1Id, teacherOverride2Id: teacher2Id });
      updateInstance(id, { teacherOverride1Id: teacher1Id, teacherOverride2Id: teacher2Id });
      updated++;
    } catch (err) {
      errors.push(`${id}: ${dbError(err)}`);
    }
  }

  revalidateClasses();
  if (errors.length > 0) {
    return { success: false, updated, error: `${errors.length} instance(s) failed to persist` };
  }
  return { success: true, updated };
}

/**
 * Bulk block instances — marks them as intentionally unassigned.
 * DB-first for each instance.
 */
export async function bulkBlockInstancesAction(
  instanceIds: string[]
): Promise<{ success: boolean; updated: number; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();
  if (!instanceIds || instanceIds.length === 0) {
    return { success: false, updated: 0, error: "No instances selected" };
  }

  let updated = 0;
  const errors: string[] = [];

  for (const id of instanceIds) {
    const existing = getInstance(id);
    if (!existing) continue;

    try {
      await saveInstanceToDB(id, { teacherOverride1Id: BLOCKED_SENTINEL, teacherOverride2Id: null });
      updateInstance(id, { teacherOverride1Id: BLOCKED_SENTINEL, teacherOverride2Id: null });
      updated++;
    } catch (err) {
      errors.push(`${id}: ${dbError(err)}`);
    }
  }

  revalidateClasses();
  if (errors.length > 0) {
    return { success: false, updated, error: `${errors.length} instance(s) failed to persist` };
  }
  return { success: true, updated };
}

/**
 * Bulk update default assignments for a set of class IDs.
 * DB-first for each assignment.
 */
export async function bulkDefaultAssignmentAction(
  classEntries: { classId: string; classTitle: string }[],
  action: "assign" | "clear",
  teacher1Id?: string | null,
  teacher2Id?: string | null
): Promise<{ success: boolean; updated: number; error?: string }> {
  await requireRole(["admin"]);
  if (!classEntries || classEntries.length === 0) {
    return { success: false, updated: 0, error: "No classes provided" };
  }

  const uniqueClasses = new Map<string, string>();
  for (const c of classEntries) {
    if (c.classId) uniqueClasses.set(c.classId, c.classTitle);
  }

  let updated = 0;
  const errors: string[] = [];

  if (action === "assign") {
    if (!teacher1Id) return { success: false, updated: 0, error: "Teacher 1 is required" };
    const today = new Date().toISOString().slice(0, 10);

    for (const [classId, classTitle] of uniqueClasses) {
      const existing = getActiveAssignmentForClass(classId);
      try {
        if (existing) {
          if (hasSupabaseConfig()) {
            const repo = await getAssignmentRepo();
            await repo.update(existing.id, { teacher1Id, teacher2Id: teacher2Id ?? null });
          }
          updateAssignment(existing.id, { teacher1Id, teacher2Id: teacher2Id ?? null });
        } else {
          const data = { classId, classTitle, teacher1Id, teacher2Id: teacher2Id ?? null, effectiveFrom: today, effectiveUntil: null, isActive: true };
          if (hasSupabaseConfig()) {
            const repo = await getAssignmentRepo();
            const dbAssignment = await repo.create(data);
            const assignment = createAssignment(data);
            assignment.id = dbAssignment.id;
          } else {
            createAssignment(data);
          }
        }
        updated++;
      } catch (err) {
        errors.push(`${classId}: ${dbError(err)}`);
      }
    }
  } else {
    for (const [classId] of uniqueClasses) {
      const existing = getActiveAssignmentForClass(classId);
      if (!existing) continue;
      try {
        if (hasSupabaseConfig()) {
          const repo = await getAssignmentRepo();
          await repo.update(existing.id, { isActive: false });
        }
        updateAssignment(existing.id, { isActive: false });
        updated++;
      } catch (err) {
        errors.push(`${classId}: ${dbError(err)}`);
      }
    }
  }

  revalidateClasses();
  if (errors.length > 0) {
    return { success: false, updated, error: `${errors.length} assignment(s) failed to persist` };
  }
  return { success: true, updated };
}

// ── Bulk create instances ───────────────────────────────────

export async function bulkCreateInstancesAction(
  templateIds: string[],
  startDate: string,
  endDate: string,
  status: InstanceStatus
): Promise<{ success: boolean; created: number; skipped: number; failed: number; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();

  const empty = { success: false, created: 0, skipped: 0, failed: 0 };
  if (!templateIds.length) return { ...empty, error: "No templates selected" };
  if (!startDate || !endDate) return { ...empty, error: "Date range required" };
  if (endDate < startDate) return { ...empty, error: "End date must be after start date" };
  if (!VALID_STATUSES.has(status)) return { ...empty, error: "Invalid status" };

  const allTerms = await getTermRepo().getAll();
  const termRanges = allTerms.map((t) => ({ id: t.id, startDate: t.startDate, endDate: t.endDate }));

  const selectedTemplates = templateIds
    .map((id) => getTemplate(id))
    .filter((t): t is NonNullable<ReturnType<typeof getTemplate>> => !!t);

  if (selectedTemplates.length === 0) {
    return { ...empty, error: "No valid templates found" };
  }

  const existingKeys = new Set<string>();
  for (const inst of getInstances()) {
    if (inst.classId) existingKeys.add(`${inst.classId}|${inst.date}|${inst.startTime}`);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);

    for (const tpl of selectedTemplates) {
      if (tpl.dayOfWeek !== jsDay) continue;

      const key = `${tpl.id}|${dateStr}|${tpl.startTime}`;
      if (existingKeys.has(key)) { skipped++; continue; }

      let termId = tpl.termId ?? null;
      const termBound = tpl.termBound ?? false;

      if (termBound && termId) {
        const linked = termRanges.find((t) => t.id === termId);
        if (linked && (dateStr < linked.startDate || dateStr > linked.endDate)) { skipped++; continue; }
      } else if (termBound && !termId) {
        const matched = termRanges.find((t) => t.startDate <= dateStr && dateStr <= t.endDate);
        if (matched) { termId = matched.id; } else { skipped++; continue; }
      } else if (!termId) {
        const matched = termRanges.find((t) => t.startDate <= dateStr && dateStr <= t.endDate);
        if (matched) termId = matched.id;
      }

      const instanceData = {
        classId: tpl.id,
        title: tpl.title,
        classType: tpl.classType as ClassType,
        styleName: tpl.styleName,
        styleId: tpl.styleId,
        level: tpl.level,
        date: dateStr,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        maxCapacity: tpl.maxCapacity,
        leaderCap: tpl.leaderCap,
        followerCap: tpl.followerCap,
        location: tpl.location,
        status,
        notes: null as string | null,
        termBound,
        termId,
      };

      try {
        const dbInst = await createInstanceInDB({
          ...instanceData,
          classType: instanceData.classType as "class" | "social" | "student_practice",
        });
        const memInst = createInstance(instanceData);
        if (dbInst) memInst.id = dbInst.id;
        existingKeys.add(key);
        created++;
      } catch (err) {
        console.error("[bulkCreateInstancesAction] Failed:", dbError(err));
        failed++;
      }
    }
  }

  revalidateClasses();

  if (failed > 0 && created === 0) {
    return { success: false, created, skipped, failed, error: `All ${failed} instances failed to create` };
  }
  if (failed > 0) {
    return { success: false, created, skipped, failed, error: `Created ${created} but ${failed} failed` };
  }
  return { success: true, created, skipped, failed };
}

// ── Copy previous month schedule ────────────────────────────

export async function copyMonthScheduleAction(
  sourceYM: string,
  targetYM: string,
  opts: { copyTeachers: boolean; copyNotes: boolean; status: InstanceStatus }
): Promise<{ success: boolean; created: number; skipped: number; failed: number; error?: string }> {
  await requireRole(["admin"]);
  await ensureScheduleBootstrapped();

  const empty = { success: false, created: 0, skipped: 0, failed: 0 };

  if (!/^\d{4}-\d{2}$/.test(sourceYM) || !/^\d{4}-\d{2}$/.test(targetYM)) {
    return { ...empty, error: "Invalid month format" };
  }
  if (sourceYM === targetYM) return { ...empty, error: "Source and target months must be different" };
  if (!VALID_STATUSES.has(opts.status)) return { ...empty, error: "Invalid status" };

  const [sy, sm] = sourceYM.split("-").map(Number);
  const srcStart = `${sourceYM}-01`;
  const srcLastDay = new Date(sy, sm, 0).getDate();
  const srcEnd = `${sourceYM}-${String(srcLastDay).padStart(2, "0")}`;

  const [ty, tm] = targetYM.split("-").map(Number);
  const tgtStart = `${targetYM}-01`;
  const tgtLastDay = new Date(ty, tm, 0).getDate();
  const tgtEnd = `${targetYM}-${String(tgtLastDay).padStart(2, "0")}`;

  const allInstances = getInstances();
  const sourceInstances = allInstances.filter((bc) => bc.date >= srcStart && bc.date <= srcEnd);

  if (sourceInstances.length === 0) {
    return { ...empty, error: `No class instances found in ${sourceYM}` };
  }

  type SlotRep = {
    dayOfWeek: number;
    classId: string | null;
    title: string;
    classType: ClassType;
    styleName: string | null;
    styleId: string | null;
    level: string | null;
    startTime: string;
    endTime: string;
    maxCapacity: number | null;
    leaderCap: number | null;
    followerCap: number | null;
    location: string;
    teacherOverride1Id?: string | null;
    teacherOverride2Id?: string | null;
    termBound?: boolean;
    notes?: string | null;
  };

  const slotMap = new Map<string, { rep: SlotRep; latestDate: string }>();
  for (const bc of sourceInstances) {
    const dow = new Date(bc.date + "T12:00:00").getDay();
    const key = bc.classId
      ? `${dow}|${bc.classId}|${bc.startTime}`
      : `${dow}|${bc.title}|${bc.startTime}|${bc.endTime}`;
    const existing = slotMap.get(key);

    if (!existing || bc.date > existing.latestDate) {
      slotMap.set(key, {
        latestDate: bc.date,
        rep: {
          dayOfWeek: dow,
          classId: bc.classId,
          title: bc.title,
          classType: bc.classType,
          styleName: bc.styleName,
          styleId: bc.styleId,
          level: bc.level,
          startTime: bc.startTime,
          endTime: bc.endTime,
          maxCapacity: bc.maxCapacity,
          leaderCap: bc.leaderCap,
          followerCap: bc.followerCap,
          location: bc.location,
          teacherOverride1Id: bc.teacherOverride1Id,
          teacherOverride2Id: bc.teacherOverride2Id,
          termBound: bc.termBound,
          notes: bc.notes,
        },
      });
    }
  }

  const slots = Array.from(slotMap.values()).map((v) => v.rep);

  const existingKeys = new Set<string>();
  for (const inst of allInstances) {
    if (inst.classId) existingKeys.add(`${inst.classId}|${inst.date}|${inst.startTime}`);
  }

  const allTerms = await getTermRepo().getAll();
  const termRanges = allTerms.map((t) => ({ id: t.id, startDate: t.startDate, endDate: t.endDate }));

  let created = 0;
  let skipped = 0;
  let failed = 0;

  const start = new Date(tgtStart + "T12:00:00");
  const end = new Date(tgtEnd + "T12:00:00");

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    const dateStr = d.toISOString().slice(0, 10);

    for (const slot of slots) {
      if (slot.dayOfWeek !== dow) continue;

      const dupKey = slot.classId
        ? `${slot.classId}|${dateStr}|${slot.startTime}`
        : null;
      if (dupKey && existingKeys.has(dupKey)) { skipped++; continue; }

      let termId: string | null = null;
      const matchedTerm = termRanges.find((t) => t.startDate <= dateStr && dateStr <= t.endDate);
      if (matchedTerm) termId = matchedTerm.id;

      const instanceData = {
        classId: slot.classId,
        title: slot.title,
        classType: slot.classType,
        styleName: slot.styleName,
        styleId: slot.styleId,
        level: slot.level,
        date: dateStr,
        startTime: slot.startTime,
        endTime: slot.endTime,
        maxCapacity: slot.maxCapacity,
        leaderCap: slot.leaderCap,
        followerCap: slot.followerCap,
        location: slot.location,
        status: opts.status,
        notes: (opts.copyNotes ? slot.notes : null) as string | null,
        termBound: slot.termBound ?? false,
        termId,
        ...(opts.copyTeachers
          ? {
              teacherOverride1Id: slot.teacherOverride1Id ?? null,
              teacherOverride2Id: slot.teacherOverride2Id ?? null,
            }
          : {}),
      };

      try {
        const dbInst = await createInstanceInDB({
          ...instanceData,
          classType: instanceData.classType as "class" | "social" | "student_practice",
        });
        const memInst = createInstance(instanceData);
        if (dbInst) memInst.id = dbInst.id;

        if (opts.copyTeachers && (slot.teacherOverride1Id || slot.teacherOverride2Id)) {
          const overridePatch = {
            teacherOverride1Id: slot.teacherOverride1Id ?? null,
            teacherOverride2Id: slot.teacherOverride2Id ?? null,
          };
          const newId = dbInst?.id ?? memInst.id;
          try {
            await saveInstanceToDB(newId, overridePatch);
          } catch { /* best effort */ }
          Object.assign(memInst, overridePatch);
        }

        if (dupKey) existingKeys.add(dupKey);
        created++;
      } catch (err) {
        console.error("[copyMonthScheduleAction] Failed:", dbError(err));
        failed++;
      }
    }
  }

  revalidateClasses();

  if (failed > 0 && created === 0) {
    return { success: false, created, skipped, failed, error: `All ${failed} instances failed to create` };
  }
  if (failed > 0) {
    return { success: false, created, skipped, failed, error: `Created ${created} but ${failed} failed` };
  }
  return { success: true, created, skipped, failed };
}

// ── Dev-only actions ────────────────────────────────────────

export async function clearScheduleAction(): Promise<{
  success: boolean; cleared: number; error?: string;
}> {
  await requireRole(["admin"]);
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const cleared = clearAllInstances();
  revalidateClasses();
  return { success: true, cleared };
}

export async function clearTemplatesAction(): Promise<{
  success: boolean; cleared: number; error?: string;
}> {
  await requireRole(["admin"]);
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const cleared = clearAllTemplates();
  revalidateClasses();
  return { success: true, cleared };
}

export async function clearAssignmentsAction(): Promise<{
  success: boolean; cleared: number; error?: string;
}> {
  await requireRole(["admin"]);
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const cleared = clearAllAssignments();
  revalidateClasses();
  return { success: true, cleared };
}
