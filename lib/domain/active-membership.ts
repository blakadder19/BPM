/**
 * Active membership check used to gate members-only event tickets.
 *
 * A student is considered to have an active membership when they hold
 * at least one subscription that satisfies ALL of the following:
 *   - productType === "membership"
 *   - status === "active" (not paused / expired / exhausted / cancelled)
 *   - validFrom is on or before the reference date
 *   - validUntil is null or on or after the reference date
 *   - paymentStatus is one of the "valid" sale statuses
 *     ("paid" | "complimentary" | "waived"). Pending, cancelled, and
 *     refunded subscriptions are intentionally excluded so a student
 *     who has not actually paid yet cannot access members-only perks.
 *
 * This is the single source of truth for the members-only event ticket
 * feature. It deliberately reuses the existing
 * MockSubscription / SalePaymentStatus shape rather than introducing a
 * second membership system.
 */

import type { MockSubscription } from "@/lib/mock-data";
import type { SalePaymentStatus } from "@/types/domain";

const VALID_PAID_STATUSES: ReadonlySet<SalePaymentStatus> = new Set([
  "paid",
  "complimentary",
  "waived",
]);

export function isActiveMembershipSubscription(
  s: Pick<
    MockSubscription,
    "productType" | "status" | "validFrom" | "validUntil" | "paymentStatus"
  >,
  referenceDate: string,
): boolean {
  if (s.productType !== "membership") return false;
  if (s.status !== "active") return false;
  if (s.validFrom > referenceDate) return false;
  if (s.validUntil && s.validUntil < referenceDate) return false;
  if (!VALID_PAID_STATUSES.has(s.paymentStatus)) return false;
  return true;
}

export function hasActiveMembership(
  subscriptions: ReadonlyArray<
    Pick<
      MockSubscription,
      "productType" | "status" | "validFrom" | "validUntil" | "paymentStatus"
    >
  >,
  referenceDate: string,
): boolean {
  return subscriptions.some((s) => isActiveMembershipSubscription(s, referenceDate));
}

/**
 * Convenience wrapper for server actions: loads the student's
 * subscriptions via the repository and returns whether they currently
 * have an active membership. Centralised here so every event purchase
 * path goes through the exact same check.
 */
export async function studentHasActiveMembership(
  studentId: string,
  referenceDate: string = new Date().toISOString().slice(0, 10),
): Promise<boolean> {
  const { getSubscriptionRepo } = await import("@/lib/repositories");
  const subs = await getSubscriptionRepo().getByStudent(studentId);
  return hasActiveMembership(subs, referenceDate);
}
