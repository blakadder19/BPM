/**
 * Shared datetime utilities for the BPM booking system.
 *
 * All class times are in local Dublin time. We parse "YYYY-MM-DD" + "HH:MM"
 * without a Z suffix so JS interprets them as local time. This is correct
 * for a server running in the academy's timezone.
 *
 * PROVISIONAL: When deploying to a server in a different timezone, add
 * explicit Europe/Dublin handling here.
 */

import { getSettings } from "@/lib/services/settings-store";

function getClosureMinutes(): number {
  try {
    return getSettings().attendanceClosureMinutes;
  } catch {
    return 60;
  }
}

export function classStartDT(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00`);
}

export function classEndDT(date: string, endTime: string): Date {
  return new Date(`${date}T${endTime}:00`);
}

export function getNow(): Date {
  return new Date();
}

export function getTodayStr(): string {
  const now = getNow();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isClassStarted(date: string, startTime: string): boolean {
  return getNow() >= classStartDT(date, startTime);
}

export function isClassInFuture(date: string, startTime: string): boolean {
  return getNow() < classStartDT(date, startTime);
}

/**
 * Whether the attendance/check-in closure window has passed.
 * After this point, unchecked confirmed bookings should be marked as missed.
 */
export function isAfterClosureWindow(date: string, startTime: string): boolean {
  const mins = getClosureMinutes();
  const closure = classStartDT(date, startTime);
  closure.setMinutes(closure.getMinutes() + mins);
  return getNow() > closure;
}

/**
 * Whether check-in is still allowed (from class start until closure window).
 */
export function isCheckInOpen(date: string, startTime: string): boolean {
  const now = getNow();
  const start = classStartDT(date, startTime);
  const mins = getClosureMinutes();
  const closure = new Date(start.getTime() + mins * 60_000);
  return now >= start && now <= closure;
}

/**
 * Minutes until class start. Negative means class already started.
 */
export function minutesUntilStart(date: string, startTime: string): number {
  const ms = classStartDT(date, startTime).getTime() - getNow().getTime();
  return Math.round(ms / 60_000);
}
