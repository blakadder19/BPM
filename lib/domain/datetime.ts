/**
 * Shared datetime utilities for the BPM booking system.
 *
 * IMPORTANT: This module is imported by client components ("use client").
 * It must remain pure — no imports from server-only modules (settings-store, etc.).
 * Any configurable values (like closure minutes) must be passed as parameters.
 *
 * All class times are stored as academy-local date + time strings
 * (e.g. "2026-03-30" + "19:00"). This module converts them to proper
 * UTC-based Date objects using the Intl API with an explicit timezone,
 * so it works correctly regardless of the server's system timezone.
 *
 * Server-side: APP_TIMEZONE env var can override the default.
 * Client-side: falls back to "Europe/Dublin" (NEXT_PUBLIC_ not needed
 * because the academy timezone is a fixed constant).
 */

const ACADEMY_TIMEZONE = process.env.APP_TIMEZONE || "Europe/Dublin";

const DEFAULT_CLOSURE_MINUTES = 60;

// ── Timezone conversion (Intl-based, no external deps) ──────

/**
 * Cached DateTimeFormat for resolving UTC offsets in the academy timezone.
 * Lazy-init to avoid module-load-time issues in edge runtimes.
 */
let _offsetFmt: Intl.DateTimeFormat | undefined;
function offsetFmt(): Intl.DateTimeFormat {
  return (_offsetFmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: ACADEMY_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }));
}

/**
 * UTC offset (in ms) of the academy timezone at a given UTC instant.
 * Positive = ahead of UTC (e.g. +3_600_000 during Irish Summer Time).
 */
function tzOffsetMs(utcDate: Date): number {
  const parts = offsetFmt().formatToParts(utcDate);
  const v = (t: string) =>
    parseInt(parts.find((p) => p.type === t)!.value, 10);
  // Date.UTC handles hour>=24 by rolling to the next day, which is
  // correct for the rare case where formatToParts outputs hour 24.
  const localAsUtc = Date.UTC(
    v("year"), v("month") - 1, v("day"),
    v("hour"), v("minute"), v("second"),
  );
  return localAsUtc - utcDate.getTime();
}

/**
 * Convert an academy-local date + time to a UTC-based Date.
 * Uses a double-check to handle DST transition boundaries correctly.
 */
function toAcademyDate(dateStr: string, timeStr: string): Date {
  if (!dateStr || !timeStr) return new Date(NaN);

  const [y, mo, d] = dateStr.split("-").map(Number);
  const tp = timeStr.split(":").map(Number);
  const h = tp[0], mi = tp[1], s = tp[2] ?? 0;

  if (isNaN(y) || isNaN(mo) || isNaN(d) || isNaN(h) || isNaN(mi)) {
    return new Date(NaN);
  }

  // Treat the local components as-if UTC to get an initial guess
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = tzOffsetMs(new Date(utcGuess));
  const adjusted = utcGuess - off1;

  // Re-check offset at the adjusted instant (may differ across a DST switch)
  const off2 = tzOffsetMs(new Date(adjusted));
  return new Date(off1 === off2 ? adjusted : utcGuess - off2);
}

// ── Date formatting in academy timezone ──────────────────────

let _dateFmt: Intl.DateTimeFormat | undefined;
function dateFmt(): Intl.DateTimeFormat {
  return (_dateFmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: ACADEMY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }));
}

// ── Public helpers ───────────────────────────────────────────

function normalizeTime(t: string): string {
  return t.length <= 5 ? `${t}:00` : t;
}

export function classStartDT(date: string, startTime: string): Date {
  return toAcademyDate(date, normalizeTime(startTime));
}

export function classEndDT(date: string, endTime: string): Date {
  return toAcademyDate(date, normalizeTime(endTime));
}

export function getNow(): Date {
  return new Date();
}

export function getTodayStr(): string {
  const parts = dateFmt().formatToParts(getNow());
  const v = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
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
  const start = classStartDT(date, startTime);
  return getNow().getTime() > start.getTime() + mins * 60_000;
}

/**
 * Whether check-in is still allowed (from class start until closure window).
 * @param closureMinutes — pass from settings; defaults to 60 if omitted.
 */
export function isCheckInOpen(date: string, startTime: string, closureMinutes?: number): boolean {
  const now = getNow();
  const start = classStartDT(date, startTime);
  const mins = closureMinutes ?? DEFAULT_CLOSURE_MINUTES;
  const closure = start.getTime() + mins * 60_000;
  return now >= start && now.getTime() <= closure;
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
