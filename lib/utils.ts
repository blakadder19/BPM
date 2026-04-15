import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function formatDate(date: Date | string | null | undefined): string {
  if (date == null) return "—";
  if (typeof date === "string" && date === "") return "—";
  const d = typeof date === "string"
    ? new Date(date.includes("T") ? date : date + "T12:00:00Z")
    : date;
  if (isNaN(d.getTime())) return "—";
  return `${SHORT_DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T12:00:00Z");
  if (isNaN(d.getTime())) return "—";
  return `${SHORT_DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return "—";
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  if (isNaN(h)) return "—";
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${minutes} ${suffix}`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayName(dow: number): string {
  return DAY_NAMES[dow] ?? `Day ${dow}`;
}

export function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

// ── Event datetime helpers ───────────────────────────────────

function parseEventDT(s: string): Date {
  if (s.includes("T")) {
    if (s.endsWith("Z") || /[+-]\d{2}(:\d{2})?$/.test(s)) return new Date(s);
    return new Date(s + "Z");
  }
  return new Date(s + "T00:00:00Z");
}

function fmtDayMonth(d: Date): string {
  return `${SHORT_DAYS[d.getUTCDay()]!} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]!}`;
}

function fmtTime12(d: Date): string {
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return m === 0 ? `${display} ${suffix}` : `${display}:${String(m).padStart(2, "0")} ${suffix}`;
}

/**
 * Format an event datetime string for display.
 * Returns e.g. "Fri 16 May, 8:00 PM"
 */
export function formatEventDT(dt: string | null | undefined): string {
  if (!dt) return "—";
  const d = parseEventDT(dt);
  if (isNaN(d.getTime())) return "—";
  const hasTime = dt.includes("T") && !dt.endsWith("T00:00:00");
  return hasTime ? `${fmtDayMonth(d)}, ${fmtTime12(d)}` : fmtDayMonth(d);
}

/**
 * Format a start–end event datetime range for compact display.
 * Omits repeated year/month when start and end share them.
 */
export function formatEventDateRange(start: string, end: string): string {
  const s = parseEventDT(start);
  const e = parseEventDT(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "—";
  const sHasTime = start.includes("T") && !start.endsWith("T00:00:00");
  const eHasTime = end.includes("T") && !end.endsWith("T00:00:00");
  const sameDay = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth() && s.getUTCDate() === e.getUTCDate();

  if (sameDay) {
    if (sHasTime && eHasTime) return `${fmtDayMonth(s)}, ${fmtTime12(s)} – ${fmtTime12(e)}`;
    return fmtDayMonth(s);
  }
  const startStr = sHasTime ? `${fmtDayMonth(s)}, ${fmtTime12(s)}` : fmtDayMonth(s);
  const endStr = eHasTime ? `${fmtDayMonth(e)}, ${fmtTime12(e)}` : fmtDayMonth(e);
  return `${startStr} – ${endStr}`;
}

/**
 * Extract the date-only portion (YYYY-MM-DD) from an event datetime string.
 */
export function eventDateOnly(dt: string): string {
  if (dt.includes("T")) return dt.slice(0, 10);
  return dt.slice(0, 10);
}

/**
 * Extract the time portion (HH:MM) from a datetime string, or empty string.
 */
export function eventTimeOnly(dt: string): string {
  if (!dt.includes("T")) return "";
  const t = dt.slice(11, 16);
  return t === "00:00" && dt.endsWith("T00:00:00") ? "" : t;
}

// ── Session overnight helpers ────────────────────────────────

/**
 * Whether a session is overnight (endTime <= startTime implies it ends the next day).
 */
export function isOvernightSession(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime) return false;
  return endTime <= startTime;
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Build the real start/end ISO datetime strings for a session,
 * accounting for overnight sessions where endTime <= startTime.
 */
export function sessionRealDateTimes(date: string, startTime: string, endTime: string): { start: string; end: string } {
  const normT = (t: string) => t.length === 5 ? t + ":00" : t;
  const start = `${date}T${normT(startTime)}`;
  const overnight = isOvernightSession(startTime, endTime);
  let endDate = date;
  if (overnight) {
    endDate = addOneDay(date);
  }
  const end = `${endDate}T${normT(endTime)}`;
  return { start, end };
}

/**
 * Format a session time range for display, showing the +1 day indicator for overnight sessions.
 * e.g. "9:00 PM – 5:00 AM (+1)" or "Thu 16 Apr, 9:00 PM – Fri 17 Apr, 5:00 AM"
 */
export function formatSessionTimeRange(date: string, startTime: string, endTime: string, verbose = false): string {
  const overnight = isOvernightSession(startTime, endTime);
  const normT = (t: string) => t.length === 5 ? t + ":00" : t;

  const sDate = parseEventDT(`${date}T${normT(startTime)}`);
  const sStr = fmtTime12(sDate);

  let eDateStr: string;
  if (overnight) {
    eDateStr = addOneDay(date);
  } else {
    eDateStr = date;
  }
  const eDate = parseEventDT(`${eDateStr}T${normT(endTime)}`);
  const eStr = fmtTime12(eDate);

  if (!overnight) return `${sStr} – ${eStr}`;
  if (verbose) return `${fmtDayMonth(sDate)}, ${sStr} – ${fmtDayMonth(eDate)}, ${eStr}`;
  return `${sStr} – ${eStr} (+1)`;
}

/**
 * Generate a prefixed ID for in-memory mock stores.
 * In production, replaced by DB-generated UUIDs.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
