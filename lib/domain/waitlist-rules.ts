/**
 * Pure domain logic for waitlist management and promotion.
 * No DB or framework imports — all inputs are plain typed arguments.
 */

import type { DanceRole, WaitlistStatus } from "@/types/domain";
import { canBook, type BookableClassCapacity } from "./booking-rules";

export interface WaitingEntry {
  id: string;
  studentId: string;
  danceRole: DanceRole | null;
  position: number;
  status: WaitlistStatus;
}

export interface PromotionResult {
  promoted: WaitingEntry;
  reason: string;
}

/**
 * Find the first waiting entry that can fill a freed spot.
 *
 * For partner classes, only entries requesting the freed role are eligible.
 * For non-partner classes, entries are considered in FIFO order regardless of role.
 *
 * The candidate is validated against current capacity to ensure promotion
 * would result in a confirmed (non-waitlisted) booking.
 */
export function findPromotionCandidate(
  waitingEntries: WaitingEntry[],
  freedRole: DanceRole | null,
  capacity: BookableClassCapacity
): PromotionResult | null {
  const candidates = waitingEntries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.position - b.position);

  for (const entry of candidates) {
    if (capacity.danceStyleRequiresBalance && freedRole && entry.danceRole !== freedRole) {
      continue;
    }

    const decision = canBook(capacity, entry.danceRole);
    if (decision.allowed && !decision.waitlisted) {
      return {
        promoted: entry,
        reason: freedRole
          ? `${freedRole} spot opened — promoted from position #${entry.position}`
          : `Spot opened — promoted from position #${entry.position}`,
      };
    }
  }

  return null;
}

/**
 * Reindex waitlist positions to be sequential (1, 2, 3…) after removals.
 */
export function reindexPositions<T extends { position: number; status: WaitlistStatus }>(
  entries: T[]
): T[] {
  return entries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.position - b.position)
    .map((e, i) => ({ ...e, position: i + 1 }));
}
