/**
 * Pure presentation rules for the attendance "Source" column.
 *
 * `StoredAttendance.source` has five values, but the History badge map
 * only covered four and fell back to `walk_in` for anything else. A
 * record written as `booking` therefore rendered as "Walk-in" — the
 * one label that positively asserts the opposite (no booking, and so
 * no entitlement consumed). Resolving the label here keeps the
 * fallback honest and makes the rule testable.
 */

import type { AttendanceSource } from "@/lib/services/attendance-service";

export const ATTENDANCE_SOURCE_LABELS: Record<AttendanceSource, string> = {
  booking: "Booked",
  subscription: "Subscription",
  drop_in: "Drop-in",
  walk_in: "Walk-in",
  admin: "Admin",
};

export interface AttendanceSourceDescriptor {
  /** Styling key. Falls back to `unknown` so no unmapped value borrows another source's colours. */
  key: AttendanceSource | "unknown";
  label: string;
}

function titleCase(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param source  Raw `StoredAttendance.source`; may be absent on rows
 *                written before the column existed.
 * @param hasBooking Whether the record is linked to a booking. Only
 *                consulted when `source` is missing, to avoid calling
 *                a booked attendance a walk-in.
 */
export function describeAttendanceSource(
  source: string | null | undefined,
  hasBooking = false,
): AttendanceSourceDescriptor {
  if (source && source in ATTENDANCE_SOURCE_LABELS) {
    const key = source as AttendanceSource;
    return { key, label: ATTENDANCE_SOURCE_LABELS[key] };
  }

  if (source) {
    // Unrecognised value: show it verbatim rather than guessing.
    return { key: "unknown", label: titleCase(source) };
  }

  return hasBooking
    ? { key: "booking", label: ATTENDANCE_SOURCE_LABELS.booking }
    : { key: "walk_in", label: ATTENDANCE_SOURCE_LABELS.walk_in };
}
