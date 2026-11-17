/**
 * Persists the outcome of a Stripe refund on a subscription or event
 * purchase row, and reconciles refunds Stripe reported as `pending`.
 *
 * The write rules live in `planStripeRefundPersistence`; this module only
 * maps a plan onto the two repositories, so the admin action and the
 * webhook cannot drift apart.
 */

import type Stripe from "stripe";
import { getSpecialEventRepo, getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription } from "@/lib/services/subscription-service";
import { refundPurchase } from "@/lib/services/special-event-service";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import {
  mapStripeRefundStatus,
  planStripeRefundPersistence,
  type StripeRefundPersistencePlan,
} from "@/lib/domain/stripe-refund-rules";

export type RefundEntityKind = "subscription" | "event_purchase";

export interface ApplyStripeRefundOutcomeInput {
  kind: RefundEntityKind;
  id: string;
  plan: StripeRefundPersistencePlan;
  stripeRefundId: string;
  /** Stamped as `refunded_at` only when the plan confirms returned money. */
  confirmedAtIso: string;
  /** Who initiated the refund. Omit to leave the stored value untouched. */
  refundedBy?: string;
  refundReason?: string;
}

export async function applyStripeRefundOutcome(
  input: ApplyStripeRefundOutcomeInput,
): Promise<{ success: boolean; error?: string }> {
  const { plan } = input;
  const actor = {
    ...(input.refundedBy !== undefined ? { refundedBy: input.refundedBy } : {}),
    ...(input.refundReason !== undefined ? { refundReason: input.refundReason } : {}),
  };

  let fields: {
    stripeRefundId: string;
    refundStatus: "succeeded" | "pending" | "failed";
    refundedAmountCents?: number;
    refundedAt?: string;
    refundedBy?: string;
    refundReason?: string;
  };
  let fullRefund = false;

  switch (plan.outcome) {
    case "confirmed":
      fields = {
        stripeRefundId: input.stripeRefundId,
        refundStatus: plan.refundStatus,
        refundedAmountCents: plan.refundedAmountCents,
        refundedAt: input.confirmedAtIso,
        ...actor,
      };
      fullRefund = plan.fullRefund;
      break;
    case "pending":
      fields = { stripeRefundId: input.stripeRefundId, refundStatus: plan.refundStatus, ...actor };
      break;
    case "failed":
      if (!plan.writeRow) return { success: true };
      fields = { stripeRefundId: input.stripeRefundId, refundStatus: plan.refundStatus };
      break;
    default: {
      const unreachable: never = plan;
      throw new Error(`Unhandled refund plan: ${JSON.stringify(unreachable)}`);
    }
  }

  if (input.kind === "subscription") {
    const r = await updateSubscription(input.id, {
      ...fields,
      ...(fullRefund ? { paymentStatus: "refunded" as const } : {}),
    });
    return r.success ? { success: true } : { success: false, error: r.error ?? "Failed to update subscription." };
  }
  // `fullRefund` is passed explicitly: refundPurchase defaults it to true
  // for the legacy manual flow, which would flip a pending row to refunded.
  const r = await refundPurchase(input.id, { ...fields, fullRefund });
  return r.success ? { success: true } : { success: false, error: r.error ?? "Failed to update event purchase." };
}

/**
 * Handle a `refund.updated` / `refund.failed` / `charge.refund.updated`
 * webhook. Acts only when the row is waiting on exactly this refund
 * (`stripe_refund_id` matches and `refund_status` is `pending`), so
 * replays and refunds created outside BPM are ignored.
 */
export async function reconcileStripeRefundUpdate(
  refund: Pick<Stripe.Refund, "id" | "amount" | "status" | "metadata">,
): Promise<{ handled: boolean; error?: string }> {
  const kind = refund.metadata?.bpm_kind;
  const id = refund.metadata?.bpm_entity_id;
  if ((kind !== "subscription" && kind !== "event_purchase") || !id) return { handled: false };

  const stripeStatus = mapStripeRefundStatus(refund.status);
  if (stripeStatus === "pending") return { handled: false };

  const row =
    kind === "subscription"
      ? await getSubscriptionRepo().getById(id)
      : await getSpecialEventRepo().getPurchaseById(id);
  if (!row || row.stripeRefundId !== refund.id || row.refundStatus !== "pending") {
    return { handled: false };
  }

  const paidAmountCents =
    kind === "subscription"
      ? (row as { priceCentsAtPurchase: number | null }).priceCentsAtPurchase
      : (row as { paidAmountCents: number | null }).paidAmountCents;

  const plan = planStripeRefundPersistence({
    stripeStatus,
    previousConfirmedRefundedCents: row.refundedAmountCents ?? 0,
    refundAmountCents: refund.amount,
    paidAmountCents: paidAmountCents ?? 0,
  });
  const result = await applyStripeRefundOutcome({
    kind,
    id,
    plan,
    stripeRefundId: refund.id,
    confirmedAtIso: new Date().toISOString(),
  });

  logFinanceEvent({
    entityType: kind,
    entityId: id,
    action: plan.outcome === "confirmed" ? "refunded" : "status_changed",
    performer: null,
    performedBy: "Stripe webhook",
    detail: `Stripe refund ${refund.id} reported ${refund.status ?? "unknown"}`,
    previousValue: "refund_pending",
    newValue:
      plan.outcome === "confirmed"
        ? plan.fullRefund
          ? "refunded"
          : "partially_refunded"
        : "refund_failed",
    metadata: {
      mode: "stripe_webhook",
      stripeRefundId: refund.id,
      stripeRefundStatus: refund.status ?? null,
      refundAmountCents: refund.amount,
      cumulativeRefundedAmountCents: plan.outcome === "confirmed" ? plan.refundedAmountCents : row.refundedAmountCents ?? 0,
      bpmPersistenceError: result.success ? null : result.error ?? "unknown",
    },
  });

  return result.success ? { handled: true } : { handled: true, error: result.error };
}
