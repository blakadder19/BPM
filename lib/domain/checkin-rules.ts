/**
 * Check-in eligibility rules — pure domain helpers.
 *
 * Determines whether a booking can be checked in based on time windows,
 * booking status, and configuration settings.
 */

import { classStartDT, getNow } from "./datetime";
import { getSettings } from "@/lib/services/settings-store";
import type { BookingStatus } from "@/types/domain";

const CHECKABLE_STATUSES: BookingStatus[] = ["confirmed"];
const NON_CHECKABLE_STATUSES: BookingStatus[] = ["cancelled", "late_cancelled", "missed", "checked_in"];

export interface CheckInEligibility {
  eligible: boolean;
  reason?: string;
  method?: "self" | "staff" | "qr";
}

/**
 * Whether the booking status allows check-in at all.
 */
export function isCheckableStatus(status: BookingStatus): boolean {
  return CHECKABLE_STATUSES.includes(status);
}

/**
 * Minutes from now until the class starts (positive = future, negative = past).
 */
function minutesToStart(date: string, startTime: string): number {
  const start = classStartDT(date, startTime);
  return (start.getTime() - getNow().getTime()) / 60_000;
}

/**
 * Whether the attendance closure window has passed.
 */
function isAfterClosure(date: string, startTime: string): boolean {
  const settings = getSettings();
  const start = classStartDT(date, startTime);
  const closureMs = start.getTime() + settings.attendanceClosureMinutes * 60_000;
  return getNow().getTime() > closureMs;
}

/**
 * Whether staff/admin can check in a student for this class right now.
 * Staff override: no opening-window restriction. Only blocked after
 * the attendance closure window has passed.
 */
export function canStaffCheckIn(
  date: string,
  startTime: string,
): CheckInEligibility {
  if (isAfterClosure(date, startTime)) {
    return { eligible: false, reason: "Attendance window has closed" };
  }
  return { eligible: true, method: "staff" };
}

/**
 * Whether a student can self-check-in for this class right now.
 * Opens `selfCheckInOpensMinutesBefore` minutes before class start,
 * closes at the attendance closure window.
 */
export function canSelfCheckIn(
  date: string,
  startTime: string,
): CheckInEligibility {
  const settings = getSettings();
  if (!settings.selfCheckInEnabled) {
    return { eligible: false, reason: "Self check-in is not enabled" };
  }
  const mins = minutesToStart(date, startTime);
  if (mins > settings.selfCheckInOpensMinutesBefore) {
    return { eligible: false, reason: `Check-in opens ${settings.selfCheckInOpensMinutesBefore} minutes before class` };
  }
  if (isAfterClosure(date, startTime)) {
    return { eligible: false, reason: "Attendance window has closed" };
  }
  return { eligible: true, method: "self" };
}

/**
 * Whether a QR/token-based check-in is valid right now.
 * Same window as self check-in.
 */
export function canQrCheckIn(
  date: string,
  startTime: string,
): CheckInEligibility {
  const settings = getSettings();
  if (!settings.qrCheckInEnabled) {
    return { eligible: false, reason: "QR check-in is not enabled" };
  }
  const mins = minutesToStart(date, startTime);
  if (mins > settings.selfCheckInOpensMinutesBefore) {
    return { eligible: false, reason: `QR check-in opens ${settings.selfCheckInOpensMinutesBefore} minutes before class` };
  }
  if (isAfterClosure(date, startTime)) {
    return { eligible: false, reason: "Attendance window has closed" };
  }
  return { eligible: true, method: "qr" };
}

/**
 * Full eligibility check combining booking status + time window for a given method.
 */
export function getCheckInEligibility(
  bookingStatus: BookingStatus,
  classDate: string,
  classStartTime: string,
  method: "self" | "staff" | "qr",
): CheckInEligibility {
  if (!isCheckableStatus(bookingStatus)) {
    if (bookingStatus === "checked_in") {
      return { eligible: false, reason: "Already checked in" };
    }
    return { eligible: false, reason: `Booking status "${bookingStatus}" cannot be checked in` };
  }

  switch (method) {
    case "self":
      return canSelfCheckIn(classDate, classStartTime);
    case "qr":
      return canQrCheckIn(classDate, classStartTime);
    case "staff":
      return canStaffCheckIn(classDate, classStartTime);
  }
}
