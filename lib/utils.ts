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

/**
 * Generate a prefixed ID for in-memory mock stores.
 * In production, replaced by DB-generated UUIDs.
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
