"use server";

import { requireRole } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import type { PenaltyResolution } from "@/types/domain";

export interface CancellationResult {
  success: boolean;
  className?: string;
  date?: string;
  penaltyApplied?: boolean;
  penaltyDescription?: string;
  penaltyResolution?: PenaltyResolution;
  penaltyAmountCents?: number;
  error?: string;
}

/**
 * Admin-only cancellation action. Student cancellation uses
 * studentCancelBookingAction in booking-student.ts instead.
 */
export async function cancelStudentBooking(
  bookingId: string
): Promise<CancellationResult> {
  await requireRole(["admin"]);

  if (!bookingId || typeof bookingId !== "string") {
    return { success: false, error: "Booking ID is required." };
  }

  const bookingService = getBookingService();
  const cancelledAt = new Date();
  const result = bookingService.cancelBooking(bookingId, cancelledAt);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  const { classInfo, booking } = result;

  const penaltyService = getPenaltyService();
  const penaltyOutcome = penaltyService.assessLateCancelPenalty({
    studentId: booking.studentId,
    studentName: booking.studentName,
    bookingId: booking.id,
    bookableClassId: classInfo.id,
    classTitle: classInfo.title,
    classDate: classInfo.date,
    classStartTime: classInfo.startTime,
    classType: classInfo.classType,
    cancelledAt,
    subscriptions: [],
    classContext: { danceStyleId: null, level: null },
  });

  return {
    success: true,
    className: classInfo.title,
    date: classInfo.date,
    penaltyApplied: penaltyOutcome.penaltyCreated,
    penaltyDescription: penaltyOutcome.description,
    penaltyResolution: penaltyOutcome.penalty?.resolution,
    penaltyAmountCents: penaltyOutcome.penalty?.amountCents,
  };
}
