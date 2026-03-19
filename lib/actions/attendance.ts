"use server";

import { revalidatePath } from "next/cache";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSubscriptions } from "@/lib/services/subscription-store";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import type { AttendanceMark, CheckInMethod, ClassType } from "@/types/domain";

export interface MarkAttendanceResult {
  success: boolean;
  status: AttendanceMark;
  penaltyCreated: boolean;
  penaltyDescription: string | null;
  error: string | null;
}

/**
 * Mark a student's attendance for a bookable class.
 *
 * Side-effects:
 * - present / late → booking status moves to "checked_in"
 * - absent → no-show penalty assessed (if class type qualifies + no existing penalty)
 * - changing FROM absent to anything else → waive existing pending penalty
 * - excused → no penalty, booking stays as-is
 */
/**
 * Whether an attendance status means the student attended.
 */
function isAttended(status: AttendanceMark): boolean {
  return status === "present" || status === "late";
}

/**
 * Whether an attendance status means the student did NOT attend.
 */
function isNotAttended(status: AttendanceMark): boolean {
  return status === "absent" || status === "excused";
}

/**
 * Adjust entitlement credits/classesUsed when attendance changes.
 * present/late = consume (no-op if already consumed)
 * absent/excused = restore (give back)
 */
function adjustEntitlement(
  bookingSubscriptionId: string | null,
  previousConsumed: boolean,
  newConsumed: boolean,
) {
  if (!bookingSubscriptionId || previousConsumed === newConsumed) return;

  const subs = getSubscriptions();
  const sub = subs.find((s) => s.id === bookingSubscriptionId);
  if (!sub) return;

  if (previousConsumed && !newConsumed) {
    if (sub.productType === "membership") {
      sub.classesUsed = Math.max(0, sub.classesUsed - 1);
    } else if (sub.remainingCredits !== null) {
      sub.remainingCredits += 1;
    }
  } else if (!previousConsumed && newConsumed) {
    if (sub.productType === "membership") {
      sub.classesUsed += 1;
    } else if (sub.remainingCredits !== null) {
      sub.remainingCredits = Math.max(0, sub.remainingCredits - 1);
    }
  }
}

export async function markStudentAttendance(params: {
  bookableClassId: string;
  studentId: string;
  studentName: string;
  bookingId: string | null;
  classTitle: string;
  date: string;
  classType: ClassType;
  danceStyleId: string | null;
  level: string | null;
  status: AttendanceMark;
  markedBy: string;
  checkInMethod?: CheckInMethod;
  notes?: string;
}): Promise<MarkAttendanceResult> {
  if (!params.bookableClassId || !params.studentId || !params.markedBy) {
    return {
      success: false,
      status: params.status,
      penaltyCreated: false,
      penaltyDescription: null,
      error: "Missing required fields: bookableClassId, studentId, and markedBy are required.",
    };
  }

  const attendanceSvc = getAttendanceService();
  const bookingSvc = getBookingService();
  const penaltySvc = getPenaltyService();

  const outcome = attendanceSvc.markAttendance({
    bookableClassId: params.bookableClassId,
    studentId: params.studentId,
    studentName: params.studentName,
    bookingId: params.bookingId,
    classTitle: params.classTitle,
    date: params.date,
    status: params.status,
    markedBy: params.markedBy,
    checkInMethod: params.checkInMethod,
    notes: params.notes ?? null,
  });

  if (outcome.type === "error") {
    return {
      success: false,
      status: params.status,
      penaltyCreated: false,
      penaltyDescription: null,
      error: outcome.reason,
    };
  }

  const previousStatus = outcome.type === "updated" ? outcome.previousStatus : null;
  const newStatus = params.status;

  // ── Booking status synchronization ──
  // present/late → checked_in; absent/excused → revert to confirmed
  if (params.bookingId) {
    if (isAttended(newStatus)) {
      bookingSvc.checkInBooking(params.bookingId);
    } else if (isNotAttended(newStatus)) {
      bookingSvc.revertCheckIn(params.bookingId);
    }
  }

  // ── Credit/class restoration logic ──
  // Booking already consumed at booking time. Absent/excused = restore.
  // If changing from absent→present, re-consume.
  if (params.bookingId) {
    const booking = bookingSvc.bookings.find((b) => b.id === params.bookingId);
    const subId = booking?.subscriptionId ?? null;

    const prevConsumed = previousStatus ? isAttended(previousStatus) || previousStatus === null : true;
    const newConsumed = isAttended(newStatus);

    if (previousStatus === null) {
      // First time marking: credit was consumed at booking time.
      // If not attended, restore.
      if (!newConsumed) {
        adjustEntitlement(subId, true, false);
      }
    } else {
      adjustEntitlement(subId, prevConsumed, newConsumed);
    }
  }

  // ── Penalty logic ──
  let penaltyCreated = false;
  let penaltyDescription: string | null = null;

  const wasAbsentBefore = previousStatus === "absent";
  const isAbsentNow = newStatus === "absent";

  if (isAbsentNow) {
    const existing = penaltySvc
      .getAllPenalties()
      .find(
        (p) =>
          p.bookableClassId === params.bookableClassId &&
          p.studentId === params.studentId &&
          p.reason === "no_show"
      );

    if (existing) {
      if (existing.resolution === "waived") {
        penaltySvc.updateResolution(existing.id, "monetary_pending");
        penaltyCreated = true;
        penaltyDescription = "No-show penalty reopened.";
      } else {
        penaltyDescription = "No-show penalty already exists for this class.";
      }
    } else {
      const penaltyOutcome = penaltySvc.assessNoShowPenalty({
        studentId: params.studentId,
        studentName: params.studentName,
        bookingId: params.bookingId ?? "",
        bookableClassId: params.bookableClassId,
        classTitle: params.classTitle,
        classDate: params.date,
        classType: params.classType,
        subscriptions: [],
        classContext: {
          danceStyleId: params.danceStyleId,
          level: params.level,
        },
      });
      penaltyCreated = penaltyOutcome.penaltyCreated;
      penaltyDescription = penaltyOutcome.description;
    }
  }

  if (wasAbsentBefore && !isAbsentNow) {
    const existing = penaltySvc
      .getAllPenalties()
      .find(
        (p) =>
          p.bookableClassId === params.bookableClassId &&
          p.studentId === params.studentId &&
          p.reason === "no_show" &&
          (p.resolution === "monetary_pending" || p.resolution === "waived")
      );
    if (existing) {
      penaltySvc.updateResolution(existing.id, "attendance_corrected");
      penaltyDescription = "No-show penalty voided (attendance corrected).";
    }
  }

  revalidatePath("/attendance");
  revalidatePath("/penalties");
  revalidatePath("/dashboard");
  revalidatePath("/bookings");

  return {
    success: true,
    status: params.status,
    penaltyCreated,
    penaltyDescription,
    error: null,
  };
}

/**
 * Server action wrapper: runs attendance closure AND revalidates.
 * Only call from actual server-action contexts (form actions, client invocations),
 * never during page render. For render-safe usage, import runAttendanceClosure
 * directly from lib/domain/attendance-closure.ts.
 */
export async function closeAttendanceForPastClasses(): Promise<{
  classesProcessed: number;
  bookingsMarkedMissed: number;
}> {
  const result = runAttendanceClosure();

  if (result.bookingsMarkedMissed > 0) {
    revalidatePath("/bookings");
    revalidatePath("/attendance");
    revalidatePath("/dashboard");
  }

  return result;
}

/** Dev-only: remove all attendance records from the store. */
export async function clearAllAttendanceAction(): Promise<{
  success: boolean;
  cleared: number;
  error?: string;
}> {
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const svc = getAttendanceService();
  const cleared = svc.clearAll();
  revalidatePath("/attendance");
  return { success: true, cleared };
}
