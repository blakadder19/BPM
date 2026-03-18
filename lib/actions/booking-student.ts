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

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);
  const isLate = ctx.isLate;

  const now = new Date();
  booking.status = isLate ? "late_cancelled" : "cancelled";
  booking.cancelledAt = now.toISOString();

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
  return {
    success: true,
    isLate,
    penaltyApplied,
    penaltyDescription,
  };
}
