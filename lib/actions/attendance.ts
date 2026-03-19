"use server";

import { revalidatePath } from "next/cache";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { isAfterClosureWindow } from "@/lib/domain/datetime";
import { getInstances } from "@/lib/services/schedule-store";
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

  if (
    (params.status === "present" || params.status === "late") &&
    params.bookingId
  ) {
    bookingSvc.checkInBooking(params.bookingId);
  }

  let penaltyCreated = false;
  let penaltyDescription: string | null = null;

  const wasAbsentBefore =
    outcome.type === "updated" && outcome.previousStatus === "absent";
  const isAbsentNow = params.status === "absent";

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
          p.resolution === "monetary_pending"
      );
    if (existing) {
      penaltySvc.updateResolution(existing.id, "waived");
      penaltyDescription = "No-show penalty auto-waived (attendance changed).";
    }
  }

  revalidatePath("/attendance");
  revalidatePath("/penalties");

  return {
    success: true,
    status: params.status,
    penaltyCreated,
    penaltyDescription,
    error: null,
  };
}

/**
 * Close attendance for classes past the closure window (+60 min after start).
 * Confirmed bookings without check-in become "missed".
 * No penalty is created — no-show fees are OFF by default.
 *
 * This can be called on a cron, on page load, or manually by admin.
 * It is idempotent.
 */
export async function closeAttendanceForPastClasses(): Promise<{
  classesProcessed: number;
  bookingsMarkedMissed: number;
}> {
  const bookingSvc = getBookingService();
  const instances = getInstances();
  const attendanceSvc = getAttendanceService();

  let classesProcessed = 0;
  let bookingsMarkedMissed = 0;

  for (const cls of instances) {
    if (!isAfterClosureWindow(cls.date, cls.startTime)) continue;

    const unchecked = bookingSvc.getUncheckedBookingsForClass(cls.id);
    if (unchecked.length === 0) continue;

    classesProcessed++;

    for (const booking of unchecked) {
      const alreadyMarked = attendanceSvc
        .getAllRecords()
        .some(
          (r) =>
            r.bookableClassId === cls.id &&
            r.studentId === booking.studentId &&
            (r.status === "present" || r.status === "late")
        );

      if (alreadyMarked) {
        bookingSvc.checkInBooking(booking.id);
        continue;
      }

      bookingSvc.markMissed(booking.id);
      bookingsMarkedMissed++;
    }
  }

  if (bookingsMarkedMissed > 0) {
    revalidatePath("/bookings");
    revalidatePath("/attendance");
    revalidatePath("/dashboard");
  }

  return { classesProcessed, bookingsMarkedMissed };
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
