/**
 * Shared datetime utilities for the BPM booking system.
 *
 * IMPORTANT: This module is imported by client components ("use client").
 * It must remain pure — no imports from server-only modules (settings-store, etc.).
 * Any configurable values (like closure minutes) must be passed as parameters.
 *
 * All class times are in local Dublin time. We parse "YYYY-MM-DD" + "HH:MM"
 * without a Z suffix so JS interprets them as local time.
 *
 * DEPLOYMENT REQUIREMENT: The server must run with TZ=Europe/Dublin.
 * On Vercel, set this as an environment variable. Without it, times
 * will be interpreted as UTC, making late-cancel windows, attendance
 * closure, check-in eligibility, and class started/ended detection
 * off by 0–1 hours depending on DST.
 */

const DEFAULT_CLOSURE_MINUTES = 60;

function normalizeTime(t: string): string {
  return t.length <= 5 ? `${t}:00` : t;
}

export function classStartDT(date: string, startTime: string): Date {
  return new Date(`${date}T${normalizeTime(startTime)}`);
}

export function classEndDT(date: string, endTime: string): Date {
  return new Date(`${date}T${normalizeTime(endTime)}`);
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
 * @param closureMinutes — pass from settings; defaults to 60 if omitted.
 */
export function isAfterClosureWindow(date: string, startTime: string, closureMinutes?: number): boolean {
  const mins = closureMinutes ?? DEFAULT_CLOSURE_MINUTES;
  const closure = classStartDT(date, startTime);
  closure.setMinutes(closure.getMinutes() + mins);
  return getNow() > closure;
}

/**
 * Whether check-in is still allowed (from class start until closure window).
 * @param closureMinutes — pass from settings; defaults to 60 if omitted.
 */
export function isCheckInOpen(date: string, startTime: string, closureMinutes?: number): boolean {
  const now = getNow();
  const start = classStartDT(date, startTime);
  const mins = closureMinutes ?? DEFAULT_CLOSURE_MINUTES;
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

/**
 * Whether the class end time has passed.
 */
export function isClassEnded(date: string, endTime: string): boolean {
  return getNow() > classEndDT(date, endTime);
}

/**
 * Whether the class is currently in session (started but not ended).
 */
export function isClassLive(date: string, startTime: string, endTime: string): boolean {
  const now = getNow();
  return now >= classStartDT(date, startTime) && now <= classEndDT(date, endTime);
}

/**
 * Derive the effective lifecycle status from the stored status + current time.
 *
 * - cancelled always stays cancelled (manual override)
 * - if class end time has passed → ended
 * - if class is currently in session → live
 * - otherwise → stored status (scheduled, open, closed)
 */
export function effectiveInstanceStatus(
  storedStatus: import("@/types/domain").InstanceStatus,
  date: string,
  startTime: string,
  endTime: string,
): import("@/types/domain").EffectiveInstanceStatus {
  if (storedStatus === "cancelled") return "cancelled";
  if (isClassEnded(date, endTime)) return "ended";
  if (isClassLive(date, startTime, endTime)) return "live";
  return storedStatus;
}
