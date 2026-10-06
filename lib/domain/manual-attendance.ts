/**
 * Who may add a student to a class that has no booking or attendance
 * record for them yet ("Add student" on the Attendance page).
 *
 * Two independent routes, both limited to today's classes; earlier days
 * go through the audited Backdate flow (`attendance:backdate`):
 *
 *   - checkin:manual_checkin → check a walk-in into a class that has not
 *     ended: Present or Late only, using a normal entry source.
 *   - attendance:edit_history (+ the status permission) → any status or
 *     source, including classes that ended earlier today.
 *
 * Shared by `markStudentAttendance` and the Attendance dialog so the
 * options shown are exactly the ones the server accepts. Pure.
 */
import type { AttendanceMark } from "@/types/domain";

export type ManualAttendanceSource = "subscription" | "drop_in" | "walk_in" | "admin";

export const MANUAL_ADD_STATUSES: readonly AttendanceMark[] = ["present", "late", "absent", "excused"];
export const MANUAL_ADD_SOURCES: readonly ManualAttendanceSource[] = ["subscription", "drop_in", "walk_in", "admin"];

export interface ManualAddCapabilities {
  canManualCheckIn: boolean;
  canEditHistory: boolean;
  canMarkPresent: boolean;
  canMarkAbsent: boolean;
}

/** Whether a status means the student attended. */
export function isAttended(status: AttendanceMark): boolean {
  return status === "present" || status === "late";
}

/**
 * Null when the manual add is allowed, otherwise the reason it is not.
 * `classEnded` / `isToday` must come from the stored class, in academy time.
 */
export function manualAddDenial(input: {
  caps: ManualAddCapabilities;
  status: AttendanceMark;
  source: ManualAttendanceSource;
  isToday: boolean;
  classEnded: boolean;
}): string | null {
  const { caps, status, source, isToday, classEnded } = input;
  if (!isToday) return "Attendance for an earlier day must be added with Backdate attendance.";

  const statusAllowed = status === "absent" ? caps.canMarkAbsent : caps.canMarkPresent;
  if (caps.canEditHistory && statusAllowed) return null;

  // "admin" is a no-charge override, not a check-in.
  if (caps.canManualCheckIn && !classEnded && isAttended(status) && source !== "admin") return null;

  if (!caps.canManualCheckIn) {
    return caps.canEditHistory
      ? `You do not have permission to mark students ${status}.`
      : "Adding a student manually requires the checkin:manual_checkin permission.";
  }
  if (classEnded) {
    return "This class has ended. Adding a student after the class ends requires the attendance:edit_history permission.";
  }
  if (!isAttended(status)) {
    return "Manual check-in records Present or Late only. Recording an absence requires the attendance:edit_history permission.";
  }
  return "The Admin / Manual source requires the attendance:edit_history permission.";
}

/**
 * Today's classes the user can add a student to. A class with `ended`
 * true has already finished in academy time.
 */
export function manualAddClassIds(
  caps: ManualAddCapabilities,
  todaysClasses: readonly { id: string; ended: boolean }[],
): string[] {
  return todaysClasses
    .filter((c) => (caps.canEditHistory ? true : caps.canManualCheckIn && !c.ended))
    .map((c) => c.id);
}

/** Whether to show the "Add student" button at all. */
export function canOpenManualAdd(
  caps: ManualAddCapabilities,
  todaysClasses: readonly { id: string; ended: boolean }[],
): boolean {
  return caps.canEditHistory || manualAddClassIds(caps, todaysClasses).length > 0;
}

export function allowedManualStatuses(caps: ManualAddCapabilities, classEnded: boolean): AttendanceMark[] {
  return MANUAL_ADD_STATUSES.filter((status) =>
    MANUAL_ADD_SOURCES.some((source) => manualAddDenial({ caps, status, source, isToday: true, classEnded }) === null),
  );
}

export function allowedManualSources(
  caps: ManualAddCapabilities,
  classEnded: boolean,
  status: AttendanceMark,
): ManualAttendanceSource[] {
  return MANUAL_ADD_SOURCES.filter(
    (source) => manualAddDenial({ caps, status, source, isToday: true, classEnded }) === null,
  );
}
