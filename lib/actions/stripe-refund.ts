"use server";

import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { requireAnyPermissionForAction } from "@/lib/staff-permissions";
import { getSpecialEventRepo, getSubscriptionRepo } from "@/lib/repositories";
import { applyStripeRefundOutcome } from "@/lib/services/stripe-refund-outcome";
import { logFinanceEvent, type AuditPerformer } from "@/lib/services/finance-audit-log";
import { allocateRefundedVat } from "@/lib/domain/vat";
import {
  mapStripeRefundStatus,
  planStripeRefundPersistence,
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
 *   * Records returned money only once Stripe reports the refund as
 *     `succeeded`. A `pending` refund is recorded as pending (and blocks
 *     further refunds) until the `refund.updated` webhook resolves it;
 *     a `failed` one changes no money field.
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
  // Phase 15 — the frozen VAT on the row being refunded, so the audit
  // entry can record how much VAT this refund reverses. Null when the
  // purchase predates VAT tracking or VAT never applied.
  let rowVatAmountCents: number | null = null;
  let rowVatRatePercent: number | null = null;

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
      refundStatus: sub.refundStatus ?? null,
    };
    label = sub.productName || "Subscription";
    currency = (sub.currencyAtPurchase ?? "EUR").toLowerCase();
    rowVatAmountCents = sub.vatAmountCents ?? null;
    rowVatRatePercent = sub.vatRatePercent ?? null;
  } else {
    // event_purchase
    const purchase = await getSpecialEventRepo().getPurchaseById(input.id);
    if (!purchase) return { success: false, error: "Event purchase not found." };
    record = {
      paymentMethod: purchase.paymentMethod,
      paymentReference: purchase.paymentReference,
      paidAmountCents: purchase.paidAmountCents,
      refundedAmountCents: purchase.refundedAmountCents ?? 0,
      paymentStatus: purchase.paymentStatus,
      currency: purchase.currency ?? "eur",
      refundStatus: purchase.refundStatus ?? null,
    };
    label = purchase.productNameSnapshot || "Event purchase";
    currency = (purchase.currency ?? "eur").toLowerCase();
    rowVatAmountCents = purchase.vatAmountCents ?? null;
    rowVatRatePercent = purchase.vatRatePercent ?? null;
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

  // ── 7) Persist BPM-side state, per what Stripe actually reported ──
  // Only a `succeeded` refund adds to the confirmed refunded amount,
  // stamps refunded_at or flips the row to "refunded".
  const plan = planStripeRefundPersistence({
    stripeStatus,
    previousConfirmedRefundedCents: record.refundedAmountCents,
    refundAmountCents: v.amountCents,
    paidAmountCents: record.paidAmountCents ?? 0,
  });
  const refundedByDisplay = admin.fullName?.trim() || admin.email || admin.id;
  const persisted = await applyStripeRefundOutcome({
    kind: input.kind,
    id: input.id,
    plan,
    stripeRefundId,
    confirmedAtIso: new Date().toISOString(),
    ...(plan.outcome === "failed" ? {} : { refundedBy: refundedByDisplay, refundReason: v.reason }),
  });
  const persistError = persisted.success ? null : persisted.error ?? "Failed to update the purchase after refund.";
  const confirmed = plan.outcome === "confirmed";
  const confirmedRefundedCents = confirmed ? plan.refundedAmountCents : record.refundedAmountCents;

  // ── 8) Finance audit (always written, even if BPM-side persistence
  //        failed — Stripe holds a refund object and we need the trail).
  logFinanceEvent({
    entityType: input.kind === "subscription" ? "subscription" : "event_purchase",
    entityId: input.id,
    action: confirmed ? "refunded" : "status_changed",
    performer: performerFromUser(admin),
    detail: v.reason,
    previousValue: record.paymentStatus,
    newValue: confirmed
      ? plan.fullRefund
        ? "refunded"
        : "partially_refunded"
      : plan.outcome === "pending"
        ? "refund_pending"
        : "refund_failed",
    metadata: {
      mode: "stripe",
      stripeRefundId,
      stripeRefundStatus: refund.status ?? null,
      refundedAmountCents: confirmed ? v.amountCents : 0,
      requestedRefundAmountCents: v.amountCents,
      cumulativeRefundedAmountCents: confirmedRefundedCents,
      paidAmountCents: record.paidAmountCents,
      currency,
      originalPaymentReference: record.paymentReference,
      stripePaymentIntent: piResult.paymentIntent,
      label,
      fullRefund: confirmed && plan.fullRefund,
      bpmPersistenceError: persistError,
      // Phase 15 — VAT being handed back, only once money has moved.
      // `vatReversedCents` is the slice attributable to THIS refund;
      // `cumulativeVatReversedCents` is the running total after it, which
      // is what Finance nets out of "VAT collected". A full refund always
      // reverses the whole VAT amount exactly, never a rounded
      // approximation of it.
      ...(confirmed && rowVatAmountCents != null
        ? {
            vatAmountOnPurchaseCents: rowVatAmountCents,
            vatRatePercent: rowVatRatePercent,
            vatReversedCents:
              allocateRefundedVat({
                vatAmountCents: rowVatAmountCents,
                totalIncVatCents: record.paidAmountCents ?? 0,
                refundedAmountCents: confirmedRefundedCents,
              }) -
              allocateRefundedVat({
                vatAmountCents: rowVatAmountCents,
                totalIncVatCents: record.paidAmountCents ?? 0,
                refundedAmountCents: record.refundedAmountCents ?? 0,
              }),
            cumulativeVatReversedCents: allocateRefundedVat({
              vatAmountCents: rowVatAmountCents,
              totalIncVatCents: record.paidAmountCents ?? 0,
              refundedAmountCents: confirmedRefundedCents,
            }),
          }
        : {}),
    },
  });

  // ── 9) Revalidate surfaces that show financial state ──
  revalidatePath("/finance");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  if (input.kind === "event_purchase") revalidatePath("/events");

  if (plan.outcome === "pending") {
    return {
      success: false,
      error: `Stripe accepted the refund (${stripeRefundId}) but has not confirmed it yet. BPM will record it as refunded only when Stripe confirms it.${persistError ? ` BPM-side update also failed: ${persistError}` : ""}`,
      stripeRefundId,
      refundStatus: "pending",
      refundedAmountCents: 0,
      fullRefund: false,
    };
  }

  if (plan.outcome === "failed") {
    return {
      success: false,
      error: `Stripe reported the refund (${stripeRefundId}) as failed. No money was returned and BPM was not marked refunded.`,
      stripeRefundId,
      refundStatus: "failed",
      refundedAmountCents: 0,
      fullRefund: false,
    };
  }

  if (persistError) {
    // Stripe returned the money but the BPM-side write failed — surface a
    // partial-success message so the admin knows to reconcile.
    return {
      success: false,
      error: `Stripe refund created (${stripeRefundId}) but BPM-side update failed: ${persistError}`,
      stripeRefundId,
      refundStatus: stripeStatus,
      refundedAmountCents: v.amountCents,
      fullRefund: plan.fullRefund,
    };
  }

  return {
    success: true,
    stripeRefundId,
    refundStatus: stripeStatus,
    refundedAmountCents: v.amountCents,
    fullRefund: plan.fullRefund,
  };
}
