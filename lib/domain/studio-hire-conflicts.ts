/**
 * Pure domain logic for Studio Hire time-slot conflict detection.
 *
 * Structured so additional conflict sources (class schedule, external calendar)
 * can be added as new functions without rewriting the core overlap logic.
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

/**
 * Two time slots on the same date overlap when one starts before the other ends
 * and vice versa.  Touching boundaries (10:00–11:00 and 11:00–12:00) are NOT
 * considered overlapping — the first has ended when the second begins.
 */
export function timeSlotsOverlap(
  a: { date: string; startTime: string; endTime: string },
  b: { date: string; startTime: string; endTime: string }
): boolean {
  if (a.date !== b.date) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
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
