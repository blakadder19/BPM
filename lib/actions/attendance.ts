"use server";

import { getAttendanceService } from "@/lib/services/attendance-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
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
 * - absent → no-show penalty is assessed (if class type qualifies)
 * - excused → no penalty, booking stays as-is
 *
 * TODO: when QR check-in is implemented, pass checkInMethod: "qr"
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

  if (params.status === "absent" && params.bookingId) {
    const penaltyOutcome = penaltySvc.assessNoShowPenalty({
      studentId: params.studentId,
      studentName: params.studentName,
      bookingId: params.bookingId,
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

  return {
    success: true,
    status: params.status,
    penaltyCreated,
    penaltyDescription,
    error: null,
  };
}
