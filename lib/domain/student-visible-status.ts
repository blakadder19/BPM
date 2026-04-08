/**
 * Resolves the student-visible status for a booking by overlaying the
 * attendance outcome when one exists. Attendance takes priority except
 * when the booking has been explicitly cancelled — a cancellation is a
 * stronger signal than a prior attendance record.
 */

import type { AttendanceMark } from "@/types/domain";

const CANCELLED_STATUSES = new Set(["cancelled", "late_cancelled"]);

const ATTENDANCE_TO_DISPLAY: Record<AttendanceMark, string> = {
  present: "checked_in",
  late: "late",
  absent: "absent",
  excused: "excused",
};

export function resolveStudentVisibleStatus(
  bookingStatus: string,
  attendanceMark: AttendanceMark | null | undefined,
): string {
  if (CANCELLED_STATUSES.has(bookingStatus)) {
    return bookingStatus;
  }
  if (attendanceMark && attendanceMark in ATTENDANCE_TO_DISPLAY) {
    return ATTENDANCE_TO_DISPLAY[attendanceMark];
  }
  return bookingStatus;
}
