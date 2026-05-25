/**
 * Pure helpers that compute Admin Dashboard widget statistics from
 * live booking / waitlist / attendance records.
 *
 * Why this module exists:
 *
 *   The Supabase schedule repository returns `bookable_class_instances`
 *   rows with `bookedCount=0 / leaderCount=0 / followerCount=0 /
 *   waitlistCount=0` (those columns are denormalised mock-data
 *   conveniences that have no live source of truth in Supabase). Any
 *   dashboard widget that consumes `bc.bookedCount` directly therefore
 *   showed 0 in production. We fix this once, here, by deriving counts
 *   from the canonical booking / waitlist tables — the same source the
 *   Classes admin page and the student dashboard already use via
 *   `getConfirmedBookingsForClass()` / `confirmedByClass` map.
 *
 * Scope notes for each helper are inline in their JSDoc. Keep this
 * module pure (no Supabase imports, no I/O) so it stays trivially
 * unit-testable.
 */

import type { BookingStatus, WaitlistStatus, DanceRole, AttendanceMark } from "@/types/domain";

// ── Input shapes (intentionally narrow) ──────────────────────
//
// Each consumer can pass its own row type as long as it satisfies
// the minimal shape these helpers need; this keeps the helpers
// decoupled from `StoredBooking` / `MockBooking` divergence.

export interface DashboardBookingLike {
  bookableClassId: string;
  status: BookingStatus;
  danceRole: DanceRole | null;
}

export interface DashboardWaitlistLike {
  bookableClassId: string;
  status: WaitlistStatus;
}

export interface DashboardAttendanceLike {
  date: string;
  status: AttendanceMark;
}

// ── Per-class stats ─────────────────────────────────────────

export interface PerClassBookingStats {
  /** Confirmed + checked-in bookings. The shared "active" definition. */
  bookedCount: number;
  leaderCount: number;
  followerCount: number;
  /** Waitlist entries whose status is "waiting" (not promoted / cancelled). */
  waitlistCount: number;
}

/**
 * Bookings statuses we count as "currently holding a seat" in a
 * class. Matches the definition used by the student dashboard
 * (`confirmedByClass`) and `getConfirmedBookingsForClass`.
 */
const ACTIVE_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "confirmed",
  "checked_in",
]);

/**
 * Build a lookup table keyed by `bookableClassId` with confirmed
 * booking / leader / follower / waitlist counts derived from the
 * canonical bookings + waitlist arrays.
 *
 * Cancelled, refunded, expired, and any other non-active booking
 * statuses are excluded — they do not occupy a seat and must not
 * inflate Upcoming Classes / Highest Demand / Leader-Follower
 * Balance / Bookings by Weekday.
 */
export function buildPerClassBookingStats(
  bookings: readonly DashboardBookingLike[],
  waitlist: readonly DashboardWaitlistLike[],
): Map<string, PerClassBookingStats> {
  const out = new Map<string, PerClassBookingStats>();

  function ensure(classId: string): PerClassBookingStats {
    let entry = out.get(classId);
    if (!entry) {
      entry = { bookedCount: 0, leaderCount: 0, followerCount: 0, waitlistCount: 0 };
      out.set(classId, entry);
    }
    return entry;
  }

  for (const b of bookings) {
    if (!ACTIVE_BOOKING_STATUSES.has(b.status)) continue;
    const entry = ensure(b.bookableClassId);
    entry.bookedCount++;
    if (b.danceRole === "leader") entry.leaderCount++;
    else if (b.danceRole === "follower") entry.followerCount++;
  }

  for (const w of waitlist) {
    if (w.status !== "waiting") continue;
    const entry = ensure(w.bookableClassId);
    entry.waitlistCount++;
  }

  return out;
}

const EMPTY_STATS: PerClassBookingStats = Object.freeze({
  bookedCount: 0,
  leaderCount: 0,
  followerCount: 0,
  waitlistCount: 0,
}) as PerClassBookingStats;

export function getClassStats(
  table: Map<string, PerClassBookingStats>,
  classId: string,
): PerClassBookingStats {
  return table.get(classId) ?? EMPTY_STATS;
}

// ── Bookings by weekday ─────────────────────────────────────
//
// The widget caption reads "Total class bookings across all
// scheduled instances". We honour that scope: iterate every active
// booking, look up its class date, and bucket by weekday
// (Mon=0..Sun=6).
//
// Importantly we count by BOOKING, not by instance — counting
// `bc.bookedCount` per instance was the original bug because the
// instance row's bookedCount is always 0 in Supabase mode.

export interface ClassDateLookup {
  /** Return ISO date (YYYY-MM-DD) of a class instance, or null if unknown. */
  getClassDate(classId: string): string | null;
}

/**
 * Sum active bookings into a 7-bucket array indexed Mon..Sun.
 * Bookings whose class id has no matching instance (deleted class,
 * cross-academy leak, etc.) are skipped silently.
 */
export function computeBookingsByWeekday(
  bookings: readonly DashboardBookingLike[],
  lookup: ClassDateLookup,
): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const b of bookings) {
    if (!ACTIVE_BOOKING_STATUSES.has(b.status)) continue;
    const date = lookup.getClassDate(b.bookableClassId);
    if (!date) continue;
    const idx = weekdayIndex(date);
    if (idx >= 0 && idx < 7) buckets[idx]++;
  }
  return buckets;
}

/**
 * Map an ISO date string (YYYY-MM-DD) to a 0..6 weekday index where
 * Monday=0 and Sunday=6. We use a fixed UTC time-of-day so daylight
 * savings transitions can't flip the index across timezones — same
 * approach the previous dashboard code used.
 */
export function weekdayIndex(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return -1;
  const dow = d.getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

// ── Attendance summary scope ────────────────────────────────
//
// The Attendance Summary card was previously all-time, which caused
// the misleading "100% / 62 records" reading in production — the
// closure job has been writing `present` records for months but no
// `absent` records for many of those classes, skewing the global
// rate. We scope to a rolling 30-day window so the card reflects
// recent operational health, and update the card copy to match.

export interface AttendanceTotals {
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export interface ScopedAttendanceSummary {
  totals: AttendanceTotals;
  /** Sum of totals — convenience for percentage calculations. */
  total: number;
}

/**
 * Restrict attendance records to the last `windowDays` (inclusive,
 * counted from `todayStr`) and bucket by status. Records whose date
 * is malformed are silently dropped.
 *
 * `todayStr` must be ISO YYYY-MM-DD; the helper uses lexicographic
 * comparison so it is timezone-stable as long as both inputs are
 * the same calendar reference.
 */
export function summarizeAttendanceWindow(
  records: readonly DashboardAttendanceLike[],
  todayStr: string,
  windowDays: number,
): ScopedAttendanceSummary {
  const totals: AttendanceTotals = { present: 0, late: 0, absent: 0, excused: 0 };
  const fromDate = subtractDays(todayStr, windowDays);
  if (!fromDate) return { totals, total: 0 };

  for (const r of records) {
    if (!r.date || r.date < fromDate || r.date > todayStr) continue;
    switch (r.status) {
      case "present": totals.present++; break;
      case "late": totals.late++; break;
      case "absent": totals.absent++; break;
      case "excused": totals.excused++; break;
    }
  }
  const total = totals.present + totals.late + totals.absent + totals.excused;
  return { totals, total };
}

/**
 * Subtract whole days from an ISO date (YYYY-MM-DD), returning a
 * new ISO date. Used to derive the lower bound of the attendance
 * window. Returns null on malformed input.
 */
function subtractDays(isoDate: string, days: number): string | null {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
