"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getSubscription, updateSubscription } from "@/lib/services/subscription-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSettings } from "@/lib/services/settings-store";
import { isClassStarted } from "@/lib/domain/datetime";
import {
  getCancellationContext,
  penaltiesApplyTo,
  penaltyFeeCents,
} from "@/lib/domain/cancellation-rules";

export async function studentCancelBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  isLate?: boolean;
  penaltyApplied?: boolean;
  penaltyDescription?: string;
  error?: string;
}> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  if (booking.studentId !== user.id) {
    return { success: false, error: "Not your booking" };
  }

  if (booking.status !== "confirmed") {
    return { success: false, error: "Only confirmed bookings can be cancelled" };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);

  if (ctx.hasStarted) {
    return { success: false, error: "Cannot cancel after class has started" };
  }

  const isLate = ctx.isLate;

  const cancelResult = isLate
    ? svc.cancelBookingAsAdmin(bookingId, true)
    : svc.cancelBooking(bookingId);

  if (cancelResult.type === "error") {
    return { success: false, error: cancelResult.reason };
  }

  if (booking.subscriptionId) {
    const sub = getSubscription(booking.subscriptionId);
    if (sub) {
      if (sub.productType === "membership" && sub.classesPerTerm !== null && sub.classesUsed > 0) {
        updateSubscription(sub.id, { classesUsed: sub.classesUsed - 1 });
      } else if (sub.remainingCredits !== null) {
        updateSubscription(sub.id, { remainingCredits: sub.remainingCredits + 1 });
      }
    }
  }

  let penaltyApplied = false;
  let penaltyDescription: string | undefined;

  if (isLate && penaltiesApplyTo(cls.classType)) {
    const settings = getSettings();
    if (settings.lateCancelPenaltiesEnabled) {
      const penaltySvc = getPenaltyService();
      const feeCents = penaltyFeeCents("late_cancel");
      penaltySvc.addPenalty({
        studentId: booking.studentId,
        studentName: booking.studentName,
        bookingId: booking.id,
        bookableClassId: booking.bookableClassId,
        classTitle: cls.title,
        classDate: cls.date,
        reason: "late_cancel",
        amountCents: feeCents,
        resolution: "monetary_pending",
        subscriptionId: null,
        creditDeducted: 0,
        notes: null,
      });
      penaltyApplied = true;
      penaltyDescription = `Late cancellation penalty of €${(feeCents / 100).toFixed(2)} applied.`;
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/penalties");
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  revalidatePath("/students");

  return {
    success: true,
    isLate,
    penaltyApplied,
    penaltyDescription,
  };
}

/**
 * Check whether a cancelled booking can be restored by the student.
 * Returns eligibility info for the UI without performing the restore.
 */
export async function checkRestoreEligibilityAction(
  bookingId: string
): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  if (!bookingId) return { eligible: false, reason: "Missing booking ID" };

  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { eligible: false, reason: "Not authenticated" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { eligible: false, reason: "Booking not found" };

  if (booking.studentId !== user.id) {
    return { eligible: false, reason: "Not your booking" };
  }

  if (booking.status !== "cancelled" && booking.status !== "late_cancelled") {
    return { eligible: false, reason: "Only cancelled bookings can be restored" };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { eligible: false, reason: "Class not found" };

  if (isClassStarted(cls.date, cls.startTime)) {
    return { eligible: false, reason: "Class has already started" };
  }

  return { eligible: true };
}

/**
 * Restore a cancelled booking for the current student.
 * Re-consumes the correct entitlement on success.
 */
export async function studentRestoreBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  restoredTo?: "confirmed" | "waitlisted";
  error?: string;
}> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  if (booking.studentId !== user.id) {
    return { success: false, error: "Not your booking" };
  }

  if (booking.status !== "cancelled" && booking.status !== "late_cancelled") {
    return { success: false, error: "Only cancelled bookings can be restored" };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  if (isClassStarted(cls.date, cls.startTime)) {
    return { success: false, error: "Cannot restore — class has already started" };
  }

  const result = svc.restoreBooking(bookingId);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  if (result.restoredTo === "confirmed" && booking.subscriptionId) {
    const sub = getSubscription(booking.subscriptionId);
    if (sub) {
      if (sub.productType === "membership" && sub.classesPerTerm !== null) {
        updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
      } else if (sub.remainingCredits !== null) {
        updateSubscription(sub.id, { remainingCredits: sub.remainingCredits - 1 });
      }
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  revalidatePath("/students");

  return {
    success: true,
    restoredTo: result.restoredTo,
  };
}
