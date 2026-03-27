/**
 * Pure domain logic for Studio Hire time-slot conflict detection.
 *
 * Supports overnight bookings: when endTime <= startTime, the booking
 * is understood to span from startTime on `date` to endTime on `date + 1`.
 */

export interface TimeSlot {
  id: string;
  label: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: TimeSlot[];
}

function nextDay(date: string): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Whether endTime <= startTime, meaning it crosses midnight. */
export function isOvernightBooking(startTime: string, endTime: string): boolean {
  return endTime <= startTime;
}

/**
 * Expand a booking into one or two same-day segments for overlap checking.
 * A normal booking yields one segment; an overnight booking yields two:
 *   segment 1: date startTime→"24:00"
 *   segment 2: date+1 "00:00"→endTime
 */
function toSegments(slot: { date: string; startTime: string; endTime: string }): { date: string; startTime: string; endTime: string }[] {
  if (!isOvernightBooking(slot.startTime, slot.endTime)) {
    return [slot];
  }
  return [
    { date: slot.date, startTime: slot.startTime, endTime: "24:00" },
    { date: nextDay(slot.date), startTime: "00:00", endTime: slot.endTime },
  ];
}

/**
 * Two same-day segments overlap when one starts before the other ends
 * and vice versa. Touching boundaries (10:00–11:00 and 11:00–12:00) are NOT
 * considered overlapping.
 */
function segmentsOverlap(
  a: { date: string; startTime: string; endTime: string },
  b: { date: string; startTime: string; endTime: string }
): boolean {
  if (a.date !== b.date) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Two time slots overlap if any of their same-day segments overlap.
 */
export function timeSlotsOverlap(
  a: { date: string; startTime: string; endTime: string },
  b: { date: string; startTime: string; endTime: string }
): boolean {
  const segsA = toSegments(a);
  const segsB = toSegments(b);
  for (const sa of segsA) {
    for (const sb of segsB) {
      if (segmentsOverlap(sa, sb)) return true;
    }
  }
  return false;
}

/**
 * Find Studio Hire entries that conflict with the proposed time slot.
 *
 * @param proposed   The date/time being checked
 * @param existing   All current Studio Hire entries
 * @param excludeId  Entry ID to exclude (for edit flows — don't conflict with self)
 */
export function findStudioHireConflicts(
  proposed: { date: string; startTime: string; endTime: string },
  existing: { id: string; requesterName: string; date: string; startTime: string; endTime: string; status: string }[],
  excludeId?: string
): ConflictResult {
  const active = existing.filter(
    (e) => e.id !== excludeId && e.status !== "cancelled"
  );

  const conflicts: TimeSlot[] = [];

  for (const e of active) {
    if (timeSlotsOverlap(proposed, e)) {
      conflicts.push({
        id: e.id,
        label: `${e.requesterName} (${e.startTime}–${e.endTime})`,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
      });
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}

/**
 * Build a human-readable conflict message for admin display.
 */
export function formatConflictMessage(conflicts: TimeSlot[]): string {
  if (conflicts.length === 0) return "";
  if (conflicts.length === 1) {
    return `This time overlaps with an existing booking: ${conflicts[0].label}.`;
  }
  const list = conflicts.map((c) => c.label).join(", ");
  return `This time overlaps with ${conflicts.length} existing bookings: ${list}.`;
}
