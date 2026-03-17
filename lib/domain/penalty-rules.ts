/**
 * Pure domain logic for penalty resolution.
 *
 * When a penalty is incurred, the system tries to deduct a credit from
 * the student's active subscriptions. If no suitable subscription exists,
 * the penalty remains as an unresolved monetary balance.
 *
 * This makes the resolution model explicit and auditable:
 *   - "credit_deducted" → 1 credit was taken from a subscription
 *   - "monetary_pending" → no credit available; €X.XX owed
 *   - "waived" → admin manually dismissed the penalty
 */

import {
  resolveSubscription,
  type ActiveSubscription,
  type ClassContext,
} from "./credit-rules";
import { formatCents } from "@/lib/utils";
import type { PenaltyReason, PenaltyResolution } from "@/types/domain";

export interface PenaltyDecision {
  reason: PenaltyReason;
  amountCents: number;
  resolution: PenaltyResolution;
  subscriptionId: string | null;
  creditDeducted: number;
  description: string;
}

export function resolvePenalty(
  reason: PenaltyReason,
  amountCents: number,
  subscriptions: ActiveSubscription[],
  classCtx: ClassContext
): PenaltyDecision {
  const label = reason === "late_cancel" ? "Late cancel" : "No-show";

  const sub = resolveSubscription(subscriptions, classCtx);

  if (sub) {
    return {
      reason,
      amountCents,
      resolution: "credit_deducted",
      subscriptionId: sub.id,
      creditDeducted: 1,
      description: `${label} penalty — 1 credit deducted from ${sub.productType}`,
    };
  }

  return {
    reason,
    amountCents,
    resolution: "monetary_pending",
    subscriptionId: null,
    creditDeducted: 0,
    description: `${label} penalty — ${formatCents(amountCents)} pending`,
  };
}
