"use server";

import { revalidatePath } from "next/cache";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSettings } from "@/lib/services/settings-store";
import {
  getCancellationContext,
  penaltiesApplyTo,
  penaltyFeeCents,
} from "@/lib/domain/cancellation-rules";
import type { BookingSource, DanceRole } from "@/types/domain";

const VALID_SOURCES = new Set<string>([
  "subscription",
  "drop_in",
  "admin",
  "waitlist_promotion",
]);

export async function adminCreateBookingAction(
  formData: FormData
): Promise<{ success: boolean; outcome?: string; error?: string }> {
  const studentId = (formData.get("studentId") as string)?.trim();
  const studentName = (formData.get("studentName") as string)?.trim();
  const bookableClassId = (formData.get("bookableClassId") as string)?.trim();
  const danceRole = (formData.get("danceRole") as string)?.trim() || null;
  const source = (formData.get("source") as string)?.trim();
  const subscriptionName =
    (formData.get("subscriptionName") as string)?.trim() || null;
  const adminNote = (formData.get("adminNote") as string)?.trim() || null;
  const forceConfirm = formData.get("forceConfirm") === "true";

  if (!studentId || !studentName) {
    return { success: false, error: "Student is required" };
  }
  if (!bookableClassId) {
    return { success: false, error: "Class instance is required" };
  }
  if (!source || !VALID_SOURCES.has(source)) {
    return { success: false, error: "Invalid booking source" };
  }
  if (danceRole && danceRole !== "leader" && danceRole !== "follower") {
    return { success: false, error: "Invalid role" };
  }

  const svc = getBookingService();
  const result = svc.adminBook({
    bookableClassId,
    studentId,
    studentName,
    danceRole: (danceRole as DanceRole) ?? null,
    source: source as BookingSource,
    subscriptionName,
    adminNote,
    forceConfirm,
  });

  if (result.type === "rejected") {
    return { success: false, error: result.reason };
  }

  revalidatePath("/bookings");
  return { success: true, outcome: result.type };
}

export async function adminCancelBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  isLate?: boolean;
  penaltyCreated?: boolean;
  promotedStudent?: string | null;
  error?: string;
}> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);
  const isLate = ctx.isLate;

  const result = svc.cancelBookingAsAdmin(bookingId, isLate);
  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  let penaltyCreated = false;
  if (isLate && penaltiesApplyTo(cls.classType)) {
    const settings = getSettings();
    if (settings.lateCancelPenaltiesEnabled) {
      const penaltySvc = getPenaltyService();
      penaltySvc.addPenalty({
        studentId: booking.studentId,
        studentName: booking.studentName,
        bookingId: booking.id,
        bookableClassId: booking.bookableClassId,
        classTitle: cls.title,
        classDate: cls.date,
        reason: "late_cancel",
        amountCents: penaltyFeeCents("late_cancel"),
        resolution: "monetary_pending",
        subscriptionId: null,
        creditDeducted: 0,
        notes: null,
      });
      penaltyCreated = true;
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/penalties");
  return {
    success: true,
    isLate,
    penaltyCreated,
    promotedStudent: result.promoted?.studentName ?? null,
  };
}

export async function adminCheckInBookingAction(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const result = svc.checkInBooking(bookingId);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  revalidatePath("/bookings");
  return { success: true };
}

export async function adminPromoteWaitlistAction(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  if (!waitlistId) return { success: false, error: "Missing waitlist ID" };

  const svc = getBookingService();
  const result = svc.promoteFromWaitlist(waitlistId);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  revalidatePath("/bookings");
  return { success: true };
}

export async function adminRemoveFromWaitlistAction(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  if (!waitlistId) return { success: false, error: "Missing waitlist ID" };

  const svc = getBookingService();
  const removed = svc.removeFromWaitlist(waitlistId);

  if (!removed) return { success: false, error: "Entry not found or already promoted" };

  revalidatePath("/bookings");
  return { success: true };
}

export async function checkLateCancelStatusAction(
  bookingId: string
): Promise<{
  success: boolean;
  isLate?: boolean;
  classStart?: string;
  cutoffMinutes?: number;
  minutesUntilStart?: number;
  lateCancelFeeCents?: number;
  error?: string;
}> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);

  return {
    success: true,
    isLate: ctx.isLate,
    classStart: ctx.classStart.toISOString(),
    cutoffMinutes: ctx.cutoffMinutes,
    minutesUntilStart: ctx.minutesUntilStart,
    lateCancelFeeCents: penaltyFeeCents("late_cancel"),
  };
}

export async function adminRestoreBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  restoredTo?: string;
  hasLinkedPenalty?: boolean;
  error?: string;
}> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const result = svc.restoreBooking(bookingId);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  const penaltySvc = getPenaltyService();
  const allPenalties = penaltySvc.getAllPenalties();
  const hasLinkedPenalty = allPenalties.some((p) => p.bookingId === bookingId);

  revalidatePath("/bookings");
  revalidatePath("/penalties");

  return {
    success: true,
    restoredTo: result.restoredTo,
    hasLinkedPenalty,
  };
}
