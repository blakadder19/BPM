"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getStudioHireService } from "@/lib/services/studio-hire-store";
import {
  saveStudioHireToDB,
  deleteStudioHireFromDB,
} from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import type {
  StudioHireStatus,
  StudioHireBookingType,
  StudioHireCancellationOutcome,
} from "@/types/domain";
import {
  findStudioHireConflicts,
  formatConflictMessage,
} from "@/lib/domain/studio-hire-conflicts";
import { eurToCents } from "@/lib/domain/studio-hire-financials";

const VALID_CANCELLATION_OUTCOMES: StudioHireCancellationOutcome[] = [
  "no_deposit",
  "deposit_retained",
  "deposit_refunded",
  "deposit_partial_refund",
];

const VALID_STATUSES: StudioHireStatus[] = [
  "enquiry",
  "pending",
  "confirmed",
  "cancelled",
];

const VALID_BOOKING_TYPES: StudioHireBookingType[] = [
  "private_event",
  "rehearsal",
  "workshop",
  "photoshoot",
  "other",
];

export async function createStudioHireAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  const requesterName = (formData.get("requesterName") as string)?.trim();
  const contactEmail =
    (formData.get("contactEmail") as string)?.trim() || null;
  const contactPhone =
    (formData.get("contactPhone") as string)?.trim() || null;
  const date = (formData.get("date") as string)?.trim();
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  const expectedAttendees = formData.get("expectedAttendees")
    ? Number(formData.get("expectedAttendees"))
    : null;
  const bookingType = (formData.get("bookingType") as string)?.trim();
  const isBlockBooking = formData.get("isBlockBooking") === "true";
  const blockDetails =
    (formData.get("blockDetails") as string)?.trim() || null;
  const status =
    ((formData.get("status") as string)?.trim() as StudioHireStatus) ||
    "enquiry";
  const adminNote =
    (formData.get("adminNote") as string)?.trim() || null;

  const depositRequiredEur = (formData.get("depositRequiredEur") as string)?.trim();
  const depositPaidEur = (formData.get("depositPaidEur") as string)?.trim();
  const depositRequiredCents = depositRequiredEur ? eurToCents(depositRequiredEur) : null;
  const depositPaidCents = depositPaidEur ? eurToCents(depositPaidEur) : null;

  if (!requesterName) {
    return { success: false, error: "Requester name is required" };
  }
  if (!date || !startTime || !endTime) {
    return { success: false, error: "Date, start time, and end time are required" };
  }
  if (startTime >= endTime) {
    return { success: false, error: "End time must be after start time" };
  }
  if (!bookingType || !VALID_BOOKING_TYPES.includes(bookingType as StudioHireBookingType)) {
    return { success: false, error: "Valid booking type is required" };
  }
  if (!VALID_STATUSES.includes(status)) {
    return { success: false, error: "Invalid status" };
  }

  const svc = getStudioHireService();

  const { hasConflict, conflicts } = findStudioHireConflicts(
    { date, startTime, endTime },
    svc.entries
  );
  if (hasConflict) {
    return { success: false, error: formatConflictMessage(conflicts) };
  }

  const entry = svc.create({
    requesterName,
    contactEmail,
    contactPhone,
    date,
    startTime,
    endTime,
    expectedAttendees,
    bookingType: bookingType as StudioHireBookingType,
    isBlockBooking,
    blockDetails,
    status,
    depositRequiredCents,
    depositPaidCents,
    cancellationOutcome: null,
    refundedCents: null,
    cancelledAt: null,
    cancellationNote: null,
    adminNote,
  });

  await saveStudioHireToDB(entry);
  revalidatePath("/studio-hire");
  return { success: true };
}

export async function updateStudioHireAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing entry ID" };

  const svc = getStudioHireService();
  const existing = svc.getById(id);
  if (!existing) {
    return { success: false, error: "Studio hire entry not found" };
  }

  const requesterName = (formData.get("requesterName") as string)?.trim();
  const contactEmail =
    (formData.get("contactEmail") as string)?.trim() || null;
  const contactPhone =
    (formData.get("contactPhone") as string)?.trim() || null;
  const date = (formData.get("date") as string)?.trim();
  const startTime = (formData.get("startTime") as string)?.trim();
  const endTime = (formData.get("endTime") as string)?.trim();
  const expectedAttendees = formData.get("expectedAttendees")
    ? Number(formData.get("expectedAttendees"))
    : null;
  const bookingType = (formData.get("bookingType") as string)?.trim();
  const isBlockBooking = formData.get("isBlockBooking") === "true";
  const blockDetails =
    (formData.get("blockDetails") as string)?.trim() || null;
  const status = (formData.get("status") as string)?.trim() as
    | StudioHireStatus
    | undefined;
  const adminNote =
    (formData.get("adminNote") as string)?.trim() || null;
  const cancellationNote =
    (formData.get("cancellationNote") as string)?.trim() || null;

  const depositRequiredEur = (formData.get("depositRequiredEur") as string)?.trim();
  const depositPaidEur = (formData.get("depositPaidEur") as string)?.trim();
  const depositRequiredCents = depositRequiredEur ? eurToCents(depositRequiredEur) : null;
  const depositPaidCents = depositPaidEur ? eurToCents(depositPaidEur) : null;

  if (requesterName !== undefined && !requesterName) {
    return { success: false, error: "Requester name cannot be empty" };
  }
  if (startTime && endTime && startTime >= endTime) {
    return { success: false, error: "End time must be after start time" };
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return { success: false, error: "Invalid status" };
  }
  if (
    bookingType &&
    !VALID_BOOKING_TYPES.includes(bookingType as StudioHireBookingType)
  ) {
    return { success: false, error: "Invalid booking type" };
  }

  const effectiveDate = date || existing.date;
  const effectiveStart = startTime || existing.startTime;
  const effectiveEnd = endTime || existing.endTime;

  const { hasConflict, conflicts } = findStudioHireConflicts(
    { date: effectiveDate, startTime: effectiveStart, endTime: effectiveEnd },
    svc.entries,
    id
  );
  if (hasConflict) {
    return { success: false, error: formatConflictMessage(conflicts) };
  }

  const updated = svc.update(id, {
    ...(requesterName ? { requesterName } : {}),
    ...(contactEmail !== undefined ? { contactEmail } : {}),
    ...(contactPhone !== undefined ? { contactPhone } : {}),
    ...(date ? { date } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(expectedAttendees !== undefined ? { expectedAttendees } : {}),
    ...(bookingType
      ? { bookingType: bookingType as StudioHireBookingType }
      : {}),
    isBlockBooking,
    ...(blockDetails !== undefined ? { blockDetails } : {}),
    ...(status ? { status } : {}),
    depositRequiredCents,
    depositPaidCents,
    ...(adminNote !== undefined ? { adminNote } : {}),
    ...(cancellationNote !== undefined ? { cancellationNote } : {}),
  });

  if (!updated) {
    return { success: false, error: "Failed to update entry" };
  }

  await saveStudioHireToDB(updated);
  revalidatePath("/studio-hire");
  return { success: true };
}

export async function updateStudioHireStatusAction(
  id: string,
  newStatus: StudioHireStatus,
  cancellationData?: {
    cancellationNote?: string;
    cancellationOutcome?: StudioHireCancellationOutcome;
    refundedCents?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  if (!id) return { success: false, error: "Missing entry ID" };
  if (!VALID_STATUSES.includes(newStatus)) {
    return { success: false, error: "Invalid status" };
  }

  const svc = getStudioHireService();
  const existing = svc.getById(id);
  if (!existing) {
    return { success: false, error: "Studio hire entry not found" };
  }

  if (
    newStatus === "cancelled" &&
    cancellationData?.cancellationOutcome &&
    !VALID_CANCELLATION_OUTCOMES.includes(cancellationData.cancellationOutcome)
  ) {
    return { success: false, error: "Invalid cancellation outcome" };
  }

  const isCancelling = newStatus === "cancelled";
  const updated = svc.update(id, {
    status: newStatus,
    ...(isCancelling
      ? {
          cancelledAt: new Date().toISOString(),
          cancellationNote: cancellationData?.cancellationNote || existing.cancellationNote,
          cancellationOutcome: cancellationData?.cancellationOutcome ?? null,
          refundedCents: cancellationData?.refundedCents ?? null,
        }
      : {}),
    ...(!isCancelling && existing.status === "cancelled"
      ? {
          cancelledAt: null,
          cancellationOutcome: null,
          refundedCents: null,
          cancellationNote: null,
        }
      : {}),
  });

  if (!updated) {
    return { success: false, error: "Failed to update status" };
  }

  await saveStudioHireToDB(updated);
  revalidatePath("/studio-hire");
  return { success: true };
}

export async function deleteStudioHireAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  if (!id) return { success: false, error: "Missing entry ID" };

  const svc = getStudioHireService();
  const existing = svc.getById(id);
  if (!existing) {
    return { success: false, error: "Studio hire entry not found" };
  }

  svc.delete(id);
  await deleteStudioHireFromDB(id);
  revalidatePath("/studio-hire");
  return { success: true };
}
