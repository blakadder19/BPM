/**
 * Phase 16 — one place that spends an entitlement credit.
 *
 * Before this existed, six call sites across three files each did:
 *
 *   const sub = await getSubscriptionRepo().getById(id);
 *   if (sub) {
 *     if (membership && classesPerTerm !== null)
 *       update(sub.id, { classesUsed: sub.classesUsed + 1 });
 *     else if (sub.remainingCredits !== null)
 *       update(sub.id, { remainingCredits: sub.remainingCredits - 1 });
 *   }
 *
 * — with NO validity check. The main booking paths were protected
 * upstream by `getValidEntitlements`, but the three WAITLIST-PROMOTION
 * sites were not: a student promoted off a waitlist could have a
 * credit taken from a pass whose term had already ended.
 *
 * Centralising it means the expiry rule cannot be forgotten at a new
 * call site, and every refusal is logged rather than silently
 * swallowed.
 *
 * Refunds deliberately do NOT go through the usable-credit gate —
 * giving a credit back to an expired pass is harmless (it restores
 * the historical counter) and refusing it would silently lose the
 * student's credit when an admin cancels a booking after term end.
 */

import { getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription } from "@/lib/services/subscription-service";
import { getTodayStr } from "@/lib/domain/datetime";
import {
  getCreditSnapshot,
  isSubscriptionUsable,
} from "@/lib/domain/credit-availability";

/**
 * Build a synchronous eligibility predicate for waitlist promotion.
 *
 * The booking service is synchronous and has no repository access, so
 * the caller resolves every relevant subscription up front and hands
 * the service a pure lookup. This lets the entitlement check run
 * BEFORE the confirmed booking is created, which is the whole point:
 * refusing the credit afterwards would leave a free confirmed class
 * behind.
 *
 * A waitlist entry with no `subscriptionId` is treated as eligible —
 * those are comp/admin/birthday entries that never consumed a credit
 * in the first place, so there is nothing to expire.
 *
 * @param entries Waitlist entries that might be promoted.
 */
export async function buildPromotionEligibility(
  entries: Array<{ subscriptionId: string | null }>,
  today: string = getTodayStr(),
): Promise<(entry: { subscriptionId: string | null }) => boolean> {
  const ids = Array.from(
    new Set(entries.map((e) => e.subscriptionId).filter((id): id is string => !!id)),
  );

  const repo = getSubscriptionRepo();
  const resolved = await Promise.all(
    ids.map(async (id) => [id, await repo.getById(id)] as const),
  );
  const usableById = new Map(
    resolved.map(([id, sub]) => [id, sub ? isSubscriptionUsable(sub, today) : false]),
  );

  return (entry) => {
    if (!entry.subscriptionId) return true;
    return usableById.get(entry.subscriptionId) ?? false;
  };
}

export type ConsumeSkipReason =
  | "not_found"
  | "expired"
  | "status"
  | "not_started"
  | "exhausted"
  | "unlimited";

export interface ConsumeResult {
  consumed: boolean;
  /** Populated when `consumed` is false. */
  reason?: ConsumeSkipReason;
  /** Human-readable explanation, safe to surface to an admin. */
  message?: string;
}

/**
 * Spend one credit / class from a subscription, enforcing expiry.
 *
 * Returns `consumed: false` rather than throwing so callers on the
 * waitlist path can continue promoting the student (the booking row
 * itself is already created by the booking service) while leaving a
 * clear trail that no credit was taken.
 *
 * @param context Short label used in the warning log so a refusal can
 *                be traced back to the path that triggered it.
 */
export async function consumeEntitlementCredit(
  subscriptionId: string,
  context: string,
  today: string = getTodayStr(),
): Promise<ConsumeResult> {
  const sub = await getSubscriptionRepo().getById(subscriptionId);
  if (!sub) {
    return { consumed: false, reason: "not_found", message: "Subscription not found." };
  }

  if (!isSubscriptionUsable(sub, today)) {
    const snap = getCreditSnapshot(sub, today);
    const reason: ConsumeSkipReason = snap.isPastValidity
      ? "expired"
      : snap.unusableReason === "not_started"
        ? "not_started"
        : snap.unusableReason === "exhausted"
          ? "exhausted"
          : "status";
    const message = snap.isPastValidity
      ? `${sub.productName} ended on ${sub.validUntil} — no credit was taken.`
      : `${sub.productName} is ${sub.status} — no credit was taken.`;
    console.warn(
      `[entitlement-consumption:${context}] Refused to spend a credit on subscription=${subscriptionId} (${reason}).`,
    );
    return { consumed: false, reason, message };
  }

  const snap = getCreditSnapshot(sub, today);

  if (snap.model === "unlimited") {
    // Nothing to decrement. Track the class count for reporting but
    // there is no balance to spend.
    await updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
    return { consumed: true };
  }

  if (snap.model === "class_count") {
    if (sub.classesPerTerm !== null && sub.classesUsed >= sub.classesPerTerm) {
      return {
        consumed: false,
        reason: "exhausted",
        message: `All ${sub.classesPerTerm} classes on ${sub.productName} have been used.`,
      };
    }
    await updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
    return { consumed: true };
  }

  // Credit model.
  if ((sub.remainingCredits ?? 0) <= 0) {
    return {
      consumed: false,
      reason: "exhausted",
      message: `No credits remaining on ${sub.productName}.`,
    };
  }
  await updateSubscription(sub.id, {
    remainingCredits: (sub.remainingCredits ?? 0) - 1,
  });
  return { consumed: true };
}

/**
 * Give a credit / class back.
 *
 * Intentionally NOT gated on usability — see the module header. An
 * expired pass regaining a credit simply restores its historical
 * counter; it does not become spendable again, because
 * `usableRemainingCredits` still returns 0 for it.
 */
export async function refundEntitlementCredit(
  subscriptionId: string,
): Promise<{ refunded: boolean }> {
  const sub = await getSubscriptionRepo().getById(subscriptionId);
  if (!sub) return { refunded: false };

  if (sub.productType === "membership" && sub.classesPerTerm !== null) {
    if (sub.classesUsed <= 0) return { refunded: false };
    await updateSubscription(sub.id, { classesUsed: sub.classesUsed - 1 });
    return { refunded: true };
  }

  if (sub.remainingCredits !== null) {
    await updateSubscription(sub.id, { remainingCredits: sub.remainingCredits + 1 });
    return { refunded: true };
  }

  return { refunded: false };
}
