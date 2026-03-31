/**
 * Pure domain logic for term-based subscription lifecycle.
 *
 * Determines which subscriptions should expire, and which memberships
 * are eligible for renewal preparation. No side effects — returns
 * transition instructions for the caller to execute.
 */

import type { MockSubscription } from "@/lib/mock-data";
import type { MockTerm } from "@/lib/mock-data";

export interface ExpireInstruction {
  type: "expire";
  subscriptionId: string;
  reason: "term_ended" | "validity_passed";
}

export interface RenewalInstruction {
  type: "prepare_renewal";
  subscriptionId: string;
  /** The current subscription to clone from */
  source: MockSubscription;
  /** The term the renewal should cover */
  nextTerm: MockTerm;
}

export type LifecycleInstruction = ExpireInstruction | RenewalInstruction;

const RENEWAL_WINDOW_DAYS = 7;

/**
 * Compute lifecycle transitions for all subscriptions.
 *
 * @param subscriptions All subscriptions (active ones will be checked)
 * @param terms All terms (for resolving next terms)
 * @param today ISO date string (YYYY-MM-DD)
 * @returns Array of instructions to execute
 */
export function computeTermLifecycle(
  subscriptions: MockSubscription[],
  terms: MockTerm[],
  today: string
): LifecycleInstruction[] {
  const instructions: LifecycleInstruction[] = [];
  const sortedTerms = [...terms].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;

    // 1. Check if the subscription has passed its validity end date
    if (sub.validUntil && today > sub.validUntil) {
      instructions.push({
        type: "expire",
        subscriptionId: sub.id,
        reason: sub.termId ? "term_ended" : "validity_passed",
      });
      continue;
    }

    // 2. For term-bound subscriptions, check renewal eligibility
    if (sub.termId && sub.validUntil) {
      const daysUntilEnd = daysBetween(today, sub.validUntil);

      if (daysUntilEnd <= RENEWAL_WINDOW_DAYS && daysUntilEnd >= 0) {
        if (sub.productType === "membership" && sub.autoRenew) {
          const nextTerm = findNextTerm(sortedTerms, sub.termId);
          if (nextTerm) {
            const alreadyRenewed = subscriptions.some(
              (other) =>
                other.id !== sub.id &&
                other.studentId === sub.studentId &&
                other.productId === sub.productId &&
                (other.renewedFromId === sub.id ||
                  (other.termId === nextTerm.id &&
                    (other.status === "active" || other.status === "cancelled")))
            );
            if (!alreadyRenewed) {
              instructions.push({
                type: "prepare_renewal",
                subscriptionId: sub.id,
                source: sub,
                nextTerm,
              });
            }
          }
        }
      }
    }
  }

  return instructions;
}

/**
 * Check if a single subscription should be considered expired.
 * Useful for on-the-fly checks during reads without a full lifecycle run.
 */
export function isSubscriptionExpired(
  sub: MockSubscription,
  today: string
): boolean {
  if (sub.status !== "active") return false;
  if (!sub.validUntil) return false;
  return today > sub.validUntil;
}

/**
 * Returns the number of days until a subscription's validity ends.
 * Negative means already past. null means open-ended.
 */
export function daysUntilExpiry(
  sub: MockSubscription,
  today: string
): number | null {
  if (!sub.validUntil) return null;
  return daysBetween(today, sub.validUntil);
}

function daysBetween(from: string, to: string): number {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  return Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if a membership is eligible for manual renewal by admin.
 * Must be: term-bound, membership, active or nearing expiry, with a next term available.
 */
export function isRenewalEligible(
  sub: MockSubscription,
  allSubs: MockSubscription[],
  terms: MockTerm[]
): boolean {
  if (sub.productType !== "membership") return false;
  if (!sub.termId) return false;
  if (sub.status !== "active" && sub.status !== "expired") return false;

  const sortedTerms = [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const nextTerm = findNextTerm(sortedTerms, sub.termId);
  if (!nextTerm) return false;

  const alreadyRenewed = allSubs.some(
    (other) =>
      other.id !== sub.id &&
      other.studentId === sub.studentId &&
      other.productId === sub.productId &&
      (other.renewedFromId === sub.id ||
        (other.termId === nextTerm.id &&
          (other.status === "active" || other.status === "cancelled")))
  );

  return !alreadyRenewed;
}

/**
 * Find the renewal subscription that was created from a given source subscription.
 */
export function findRenewalSuccessor(
  sourceId: string,
  allSubs: MockSubscription[]
): MockSubscription | null {
  return allSubs.find((s) => s.renewedFromId === sourceId) ?? null;
}

function findNextTerm(sortedTerms: MockTerm[], currentTermId: string): MockTerm | null {
  const idx = sortedTerms.findIndex((t) => t.id === currentTermId);
  if (idx === -1 || idx === sortedTerms.length - 1) return null;
  return sortedTerms[idx + 1];
}

export { findNextTerm };
