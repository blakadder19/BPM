/**
 * Resolves the student-visible status for a booking by overlaying the
 * attendance outcome when one exists. Attendance always takes priority
 * over raw booking status in student-facing surfaces.
 */

import type { AttendanceMark } from "@/types/domain";

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
  if (attendanceMark && attendanceMark in ATTENDANCE_TO_DISPLAY) {
    return ATTENDANCE_TO_DISPLAY[attendanceMark];
  }
  return bookingStatus;
}
