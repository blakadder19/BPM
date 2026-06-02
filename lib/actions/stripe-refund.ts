"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { requireAnyPermissionForAction } from "@/lib/staff-permissions";
import { getSpecialEventRepo, getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription } from "@/lib/services/subscription-service";
import { refundPurchase } from "@/lib/services/special-event-service";
import { logFinanceEvent, type AuditPerformer } from "@/lib/services/finance-audit-log";
import {
  validateStripeRefundRequest,
  type RefundableRecord,
} from "@/lib/domain/stripe-refund-rules";
import type { AuthUser } from "@/lib/auth";

/**
 * Issue a real Stripe refund for a BPM subscription or event purchase.
 *
 * This is the ONLY server entry-point that calls `stripe.refunds.create`.
 * Other refund flows (the existing dropdown change → `applyPaymentChangeAction`,
 * the legacy `refundEventPurchaseAction`) remain BPM-side only and are
 * appropriate for manual / cash / Revolut refunds.
 *
 * Safety properties:
 *   * Requires `finance:refund` OR `payments:refund` (both already
 *     declared sensitive in `lib/domain/permissions.ts`).
 *   * Verifies the underlying payment was processed through Stripe
 *     and has a `stripe:<sessionId>` reference.
 *   * Validates the amount against the cumulative refunded amount on
 *     the row (supports partial refunds, blocks over-refunds).
 *   * Only flips BPM state AFTER Stripe accepts the refund.
 *   * Writes a finance-audit entry with the Stripe refund id, the
 *     stripe-side status, and the original payment reference.
 *   * Never logs raw Stripe secrets or full session metadata.
 */

export interface IssueStripeRefundInput {
  /** Which entity is being refunded. */
  kind: "subscription" | "event_purchase";
  /** Primary key of the entity (subscription id OR event purchase id). */
  id: string;
  /** Amount to refund in cents. Must be ≤ remaining refundable amount. */
  amountCents: number;
  /** Required free-text reason. Stored on the row + in audit log. */
  reason: string;
}

export interface IssueStripeRefundResult {
  success: boolean;
  error?: string;
  /** Populated on success: the Stripe refund id (re_...). */
  stripeRefundId?: string;
  /** Populated on success: Stripe's refund.status at the time of the call. */
  refundStatus?: "succeeded" | "pending" | "failed" | null;
  /** Populated on success: refunded amount applied, in cents. */
  refundedAmountCents?: number;
  /** Populated on success: true if this refund brings the total to the full paid amount. */
  fullRefund?: boolean;
}

function performerFromUser(u: AuthUser): AuditPerformer {
  return { userId: u.id, email: u.email, name: u.fullName };
}

/**
 * Translate the BPM `stripe:<sessionId>` reference into the actual
 * Stripe PaymentIntent so we can call `stripe.refunds.create` with a
 * stable handle. We deliberately do NOT call `refunds.create` with
 * `checkout_session` — that's not a supported parameter — and instead
 * resolve to a PaymentIntent here.
 */
async function resolvePaymentIntent(
  stripe: Stripe,
  sessionId: string,
): Promise<{ paymentIntent: string | null; error?: string }> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });
    const pi = session.payment_intent;
    if (!pi) return { paymentIntent: null, error: "Stripe session has no PaymentIntent attached." };
    const paymentIntentId = typeof pi === "string" ? pi : pi.id;
    if (!paymentIntentId) return { paymentIntent: null, error: "Stripe session has no PaymentIntent id." };
    return { paymentIntent: paymentIntentId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Stripe session";
    return { paymentIntent: null, error: msg };
  }
}

/**
 * Convert Stripe's refund.status into BPM's narrower enum. Stripe can
 * also return `canceled` or `requires_action`; we map those to
 * `failed` so BPM never marks the row refunded for them.
 */
function mapStripeRefundStatus(status: string | null | undefined): "succeeded" | "pending" | "failed" | null {
  if (!status) return null;
  if (status === "succeeded" || status === "pending" || status === "failed") return status;
  return "failed";
}

export async function issueStripeRefundAction(
  input: IssueStripeRefundInput,
): Promise<IssueStripeRefundResult> {
  // ── 1) Permission gate ────────────────────────────────────
  const guard = await requireAnyPermissionForAction(["finance:refund", "payments:refund"]);
  if (!guard.ok) return { success: false, error: guard.error };
  const admin = guard.access.user;

  // ── 2) Stripe must be configured ──────────────────────────
  if (!isStripeEnabled()) {
    return { success: false, error: "Stripe is not configured on this environment." };
  }

  // ── 3) Load the entity and normalise it into a RefundableRecord ──
  let record: RefundableRecord;
  let label: string;
  let currency: string;

  if (input.kind === "subscription") {
    const sub = await getSubscriptionRepo().getById(input.id);
    if (!sub) return { success: false, error: "Subscription not found." };
    record = {
      paymentMethod: sub.paymentMethod,
      paymentReference: sub.paymentReference,
      paidAmountCents: sub.priceCentsAtPurchase,
      refundedAmountCents: sub.refundedAmountCents ?? 0,
      paymentStatus: sub.paymentStatus,
      currency: sub.currencyAtPurchase ?? "EUR",
    };
    label = sub.productName || "Subscription";
    currency = (sub.currencyAtPurchase ?? "EUR").toLowerCase();
  } else {
    // event_purchase
    const all = await getSpecialEventRepo().getAllPurchases();
    const purchase = all.find((p) => p.id === input.id);
    if (!purchase) return { success: false, error: "Event purchase not found." };
    record = {
      paymentMethod: purchase.paymentMethod,
      paymentReference: purchase.paymentReference,
      paidAmountCents: purchase.paidAmountCents,
      refundedAmountCents: purchase.refundedAmountCents ?? 0,
      paymentStatus: purchase.paymentStatus,
      currency: purchase.currency ?? "eur",
    };
    label = purchase.productNameSnapshot || "Event purchase";
    currency = (purchase.currency ?? "eur").toLowerCase();
  }

  // ── 4) Pure validation (amount, reason, Stripe-only, etc.) ──
  const v = validateStripeRefundRequest(record, { amountCents: input.amountCents, reason: input.reason });
  if (!v.ok) return { success: false, error: v.message };

  // ── 5) Resolve PaymentIntent from the Checkout Session id ──
  const stripe = getStripe();
  const piResult = await resolvePaymentIntent(stripe, v.stripeSessionId);
  if (!piResult.paymentIntent) {
    return {
      success: false,
      error: piResult.error
        ? `Stripe could not load the original payment: ${piResult.error}`
        : "Stripe could not load the original payment.",
    };
  }

  // ── 6) Call Stripe refunds API ────────────────────────────
  let refund: Stripe.Refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: piResult.paymentIntent,
      amount: v.amountCents,
      metadata: {
        bpm_kind: input.kind,
        bpm_entity_id: input.id,
        bpm_refunded_by: admin.id,
        bpm_reason: v.reason.slice(0, 480),
      },
    });
  } catch (e) {
    const stripeMessage = e instanceof Error ? e.message : "Unknown Stripe error";
    // Surface a safe error to the admin but do NOT mutate any BPM row.
    return { success: false, error: `Stripe could not create the refund: ${stripeMessage}` };
  }

  const stripeRefundId = refund.id;
  const stripeStatus = mapStripeRefundStatus(refund.status);

  // ── 7) Persist BPM-side state (only after Stripe accepted) ──
  const refundedAtIso = new Date().toISOString();
  const refundedByDisplay = admin.fullName?.trim() || admin.email || admin.id;
  let persistError: string | null = null;

  if (input.kind === "subscription") {
    const patch: Parameters<typeof updateSubscription>[1] = {
      stripeRefundId,
      refundedAmountCents: v.newRefundedAmountCents,
      refundStatus: stripeStatus,
      refundedAt: refundedAtIso,
      refundedBy: refundedByDisplay,
      refundReason: v.reason,
    };
    if (v.fullRefund && stripeStatus !== "failed") {
      patch.paymentStatus = "refunded";
    }
    const r = await updateSubscription(input.id, patch);
    if (!r.success) persistError = r.error ?? "Failed to update subscription after refund.";
  } else {
    const r = await refundPurchase(input.id, {
      refundedAt: refundedAtIso,
      refundedBy: refundedByDisplay,
      refundReason: v.reason,
      stripeRefundId,
      refundedAmountCents: v.newRefundedAmountCents,
      refundStatus: stripeStatus,
      fullRefund: v.fullRefund && stripeStatus !== "failed",
    });
    if (!r.success) persistError = r.error ?? "Failed to update event purchase after refund.";
  }

  // ── 8) Finance audit (always written, even if BPM-side persistence
  //        failed — the money has moved on Stripe and we need the trail).
  logFinanceEvent({
    entityType: input.kind === "subscription" ? "subscription" : "event_purchase",
    entityId: input.id,
    action: "refunded",
    performer: performerFromUser(admin),
    detail: v.reason,
    previousValue: record.paymentStatus,
    newValue: v.fullRefund ? "refunded" : "partially_refunded",
    metadata: {
      mode: "stripe",
      stripeRefundId,
      stripeRefundStatus: stripeStatus,
      refundedAmountCents: v.amountCents,
      cumulativeRefundedAmountCents: v.newRefundedAmountCents,
      paidAmountCents: record.paidAmountCents,
      currency,
      originalPaymentReference: record.paymentReference,
      stripePaymentIntent: piResult.paymentIntent,
      label,
      fullRefund: v.fullRefund,
      bpmPersistenceError: persistError,
    },
  });

  // ── 9) Revalidate surfaces that show financial state ──
  revalidatePath("/finance");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  if (input.kind === "event_purchase") revalidatePath("/events");

  if (persistError) {
    // Stripe succeeded but BPM-side write failed — surface a partial-success
    // message so the admin knows to reconcile, but don't pretend it failed.
    return {
      success: false,
      error: `Stripe refund created (${stripeRefundId}) but BPM-side update failed: ${persistError}`,
      stripeRefundId,
      refundStatus: stripeStatus,
      refundedAmountCents: v.amountCents,
      fullRefund: v.fullRefund,
    };
  }

  return {
    success: true,
    stripeRefundId,
    refundStatus: stripeStatus,
    refundedAmountCents: v.amountCents,
    fullRefund: v.fullRefund,
  };
}
