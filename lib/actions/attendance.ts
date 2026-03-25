"use server";

import { revalidatePath } from "next/cache";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription } from "@/lib/services/subscription-service";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import type { AttendanceMark, CheckInMethod, ClassType } from "@/types/domain";
import { isRealUser } from "@/lib/utils/is-real-user";
import { saveAttendanceToDB, saveBookingToDB, savePenaltyToDB, updatePenaltyInDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { requireRole } from "@/lib/auth";

export interface MarkAttendanceResult {
  success: boolean;
  status: AttendanceMark;
  penaltyCreated: boolean;
  penaltyDescription: string | null;
  bookingStatusChange: string | null;
  creditRestored: boolean;
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
async function adjustEntitlement(
  bookingSubscriptionId: string | null,
  previousConsumed: boolean,
  newConsumed: boolean,
) {
  if (!bookingSubscriptionId || previousConsumed === newConsumed) return;

  const sub = await getSubscriptionRepo().getById(bookingSubscriptionId);
  if (!sub) return;

  if (previousConsumed && !newConsumed) {
    if (sub.productType === "membership") {
      await updateSubscription(sub.id, { classesUsed: Math.max(0, sub.classesUsed - 1) });
    } else if (sub.remainingCredits !== null) {
      await updateSubscription(sub.id, { remainingCredits: sub.remainingCredits + 1 });
    }
  } else if (!previousConsumed && newConsumed) {
    if (sub.productType === "membership") {
      await updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
    } else if (sub.remainingCredits !== null) {
      await updateSubscription(sub.id, { remainingCredits: Math.max(0, sub.remainingCredits - 1) });
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
  await ensureOperationalDataHydrated();
  await requireRole(["admin", "teacher"]);

  if (!params.bookableClassId || !params.studentId || !params.markedBy) {
    return {
      success: false,
      status: params.status,
      penaltyCreated: false,
      penaltyDescription: null,
      bookingStatusChange: null,
      creditRestored: false,
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
      bookingStatusChange: null,
      creditRestored: false,
      error: outcome.reason,
    };
  }

  const previousStatus = outcome.type === "updated" ? outcome.previousStatus : null;
  const newStatus = params.status;

  // ── Booking status synchronization ──
  // present/late → checked_in
  // absent → missed (NOT cancelled)
  // excused → booking stays as-is (no status change)
  if (params.bookingId) {
    if (isAttended(newStatus)) {
      const booking = bookingSvc.bookings.find((b) => b.id === params.bookingId);
      if (booking) {
        if (booking.status === "missed") {
          bookingSvc.restoreFromMissed(params.bookingId);
        } else {
          bookingSvc.checkInBooking(params.bookingId);
        }
      }
    } else if (newStatus === "absent") {
      bookingSvc.markMissedFromAttendance(params.bookingId);
    }
    // excused: intentionally no booking status change
  }

  // ── Credit/class restoration logic ──
  // Credits are consumed at booking time.
  // Excused: ALWAYS refund the credit (business rule).
  // Absent: refund depends on the refundCreditOnAbsent setting.
  // Present/Late: consume if not already consumed (reversal from absent/excused).
  let bookingStatusChange: string | null = null;
  let creditRestored = false;

  if (params.bookingId) {
    const booking = bookingSvc.bookings.find((b) => b.id === params.bookingId);
    const subId = booking?.subscriptionId ?? null;

    if (booking) {
      bookingStatusChange = booking.status;
    }

    const { getSettings } = await import("@/lib/services/settings-store");
    const settings = getSettings();
    const newConsumed = isAttended(newStatus);

    // Determine whether the credit was effectively consumed before this change
    let prevConsumed: boolean;
    if (previousStatus === null) {
      prevConsumed = true; // first-time marking, credit consumed at booking time
    } else if (previousStatus === "excused") {
      prevConsumed = false; // excused always refunds
    } else if (previousStatus === "absent") {
      prevConsumed = !settings.refundCreditOnAbsent; // absent refund depends on setting
    } else {
      prevConsumed = true; // present/late = consumed
    }

    // Excused always refunds
    if (newStatus === "excused" && subId && prevConsumed) {
      await adjustEntitlement(subId, true, false);
      creditRestored = true;
    }

    // Absent: refund only if setting is ON
    if (newStatus === "absent" && subId && prevConsumed && settings.refundCreditOnAbsent) {
      await adjustEntitlement(subId, true, false);
    }

    // Reversal to present/late: re-consume credit if it was previously refunded
    if (previousStatus !== null && !prevConsumed && newConsumed && subId) {
      await adjustEntitlement(subId, false, true);
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
        if (isRealUser(params.studentId)) {
          await updatePenaltyInDB(existing.id, { resolution: "monetary_pending" });
        }
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
      if (penaltyOutcome.penalty && isRealUser(params.studentId)) {
        await savePenaltyToDB(penaltyOutcome.penalty);
      }
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
      if (isRealUser(params.studentId)) {
        await updatePenaltyInDB(existing.id, { resolution: "attendance_corrected" });
      }
      penaltyDescription = "No-show penalty voided (attendance corrected).";
    }
  }

  // Write-through to Supabase for real users
  if (isRealUser(params.studentId)) {
    const record = attendanceSvc.getRecord(params.bookableClassId, params.studentId);
    if (record) await saveAttendanceToDB(record);
    if (params.bookingId) {
      const bkSvc = getBookingService();
      const bk = bkSvc.bookings.find((b) => b.id === params.bookingId);
      if (bk) await saveBookingToDB(bk);
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
    bookingStatusChange,
    creditRestored,
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
  await requireRole(["admin", "teacher"]);
  await ensureOperationalDataHydrated();
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
  await requireRole(["admin"]);
  if (process.env.NODE_ENV !== "development") {
    return { success: false, cleared: 0, error: "Not available in production" };
  }
  const svc = getAttendanceService();
  const cleared = svc.clearAll();
  revalidatePath("/attendance");
  return { success: true, cleared };
}
