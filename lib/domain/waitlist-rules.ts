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
  /**
   * Phase 16.1 — entries ahead of the promoted one that were passed
   * over because `isEligible` rejected them (typically an expired or
   * exhausted entitlement). Surfaced so the caller can log them for
   * admin follow-up rather than losing them silently.
   */
  skippedIneligible: WaitingEntry[];
}

/**
 * Predicate deciding whether a waiting entry may be promoted.
 *
 * Phase 16.1 — the caller supplies this because eligibility depends
 * on the student's live entitlement, which the pure rule layer cannot
 * look up. Omitting it preserves the pre-16.1 behaviour of promoting
 * purely on role + capacity.
 */
export type PromotionEligibilityCheck = (entry: WaitingEntry) => boolean;

/**
 * Find the first waiting entry that can fill a freed spot.
 *
 * For partner classes, only entries requesting the freed role are eligible.
 * For non-partner classes, entries are considered in FIFO order regardless of role.
 *
 * The candidate is validated against current capacity to ensure promotion
 * would result in a confirmed (non-waitlisted) booking.
 *
 * Phase 16.1 — when `isEligible` is supplied, a candidate whose
 * entitlement is no longer usable is SKIPPED and the search continues
 * down the queue. This is the only correct place for that check: by
 * the time the caller could refuse the credit, the confirmed booking
 * already exists.
 */
export function findPromotionCandidate(
  waitingEntries: WaitingEntry[],
  freedRole: DanceRole | null,
  capacity: BookableClassCapacity,
  isEligible?: PromotionEligibilityCheck,
): PromotionResult | null {
  const candidates = waitingEntries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.position - b.position);

  const skippedIneligible: WaitingEntry[] = [];

  for (const entry of candidates) {
    if (capacity.danceStyleRequiresBalance && freedRole && entry.danceRole !== freedRole) {
      continue;
    }

    const decision = canBook(capacity, entry.danceRole);
    if (!decision.allowed || decision.waitlisted) continue;

    // Entitlement gate runs AFTER the cheap role/capacity filters so
    // we only pay for an entitlement lookup on genuine candidates.
    if (isEligible && !isEligible(entry)) {
      skippedIneligible.push(entry);
      continue;
    }

    return {
      promoted: entry,
      reason: freedRole
        ? `${freedRole} spot opened — promoted from position #${entry.position}`
        : `Spot opened — promoted from position #${entry.position}`,
      skippedIneligible,
    };
  }

  return null;
}

/**
 * Which waiting entries would be passed over as ineligible.
 *
 * Used by the caller to report skipped students when NO promotion
 * happened at all — `findPromotionCandidate` returns null in that
 * case and cannot carry the list out with it.
 */
export function findIneligibleCandidates(
  waitingEntries: WaitingEntry[],
  isEligible: PromotionEligibilityCheck,
): WaitingEntry[] {
  return waitingEntries
    .filter((e) => e.status === "waiting" && !isEligible(e))
    .sort((a, b) => a.position - b.position);
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
