/**
 * Pure validation rules for the "Issue Stripe refund" admin action.
 *
 * Kept in `lib/domain` so they can be unit-tested without the Stripe
 * SDK, Supabase, or any server-only imports. The server action is
 * the only place that actually calls `stripe.refunds.create`; this
 * module's job is to fail fast (with a friendly admin-facing
 * message) on every check that doesn't need the Stripe network.
 */

// ── Inputs ──────────────────────────────────────────────────

/**
 * Minimal shape of a refundable record. Both subscriptions and event
 * purchases share these fields under different names; the action
 * layer normalises them into this struct before calling
 * `validateStripeRefundRequest`.
 */
export interface RefundableRecord {
  /** Whether the original payment was processed through Stripe. */
  paymentMethod: "stripe" | "manual" | "cash" | "card" | "bank_transfer" | "revolut" | "complimentary" | string;
  /**
   * Free-text payment reference. For Stripe-paid rows BPM stores it
   * as `stripe:<sessionId>`. We rely on this prefix as the second
   * gate so a row mis-labelled `paymentMethod: "stripe"` with no
   * reference cannot trigger a Stripe call.
   */
  paymentReference: string | null;
  /** Total amount the customer paid for this record (in cents). */
  paidAmountCents: number | null;
  /** Cumulative amount already refunded so far (in cents). 0 when no prior refund. */
  refundedAmountCents: number;
  /** BPM-side payment status before this refund attempt. */
  paymentStatus: string;
  /** Currency code (lowercased, ISO 4217). Used to pass through to Stripe. */
  currency: string | null;
}

export interface RefundRequest {
  /** Amount the admin wants to refund through Stripe, in cents. */
  amountCents: number;
  /** Free-text reason; must be non-empty after trimming. */
  reason: string | null | undefined;
}

// ── Errors ──────────────────────────────────────────────────

export type RefundValidationError =
  | "NOT_STRIPE_PAYMENT"
  | "MISSING_STRIPE_REFERENCE"
  | "ALREADY_FULLY_REFUNDED"
  | "AMOUNT_INVALID"
  | "AMOUNT_EXCEEDS_REMAINING"
  | "PAID_AMOUNT_UNKNOWN"
  | "REASON_REQUIRED";

/**
 * User-facing messages for each validation error. Mirrors the
 * wording in the brief so the UI surfaces consistent copy.
 */
export const REFUND_ERROR_MESSAGES: Record<RefundValidationError, string> = {
  NOT_STRIPE_PAYMENT:
    "This payment was not made through Stripe. Please refund it manually and update BPM.",
  MISSING_STRIPE_REFERENCE:
    "This payment is marked as Stripe but has no Stripe payment reference on file. Please refund it manually.",
  ALREADY_FULLY_REFUNDED:
    "This payment has already been fully refunded.",
  AMOUNT_INVALID:
    "Refund amount must be greater than zero.",
  AMOUNT_EXCEEDS_REMAINING:
    "Refund amount cannot exceed the remaining refundable amount.",
  PAID_AMOUNT_UNKNOWN:
    "Cannot refund this transaction because the original paid amount is unknown.",
  REASON_REQUIRED:
    "A refund reason is required.",
};

// ── Result ──────────────────────────────────────────────────

export interface RefundValidationOk {
  ok: true;
  amountCents: number;
  reason: string;
  /** Remaining refundable amount AFTER this refund would be applied. */
  newRefundedAmountCents: number;
  /** True when this refund would bring the cumulative refund to the full paid amount. */
  fullRefund: boolean;
  /** Bare Stripe Checkout Session id (no `stripe:` prefix). */
  stripeSessionId: string;
}

export interface RefundValidationFail {
  ok: false;
  error: RefundValidationError;
  message: string;
}

export type RefundValidationResult = RefundValidationOk | RefundValidationFail;

// ── Main entry point ────────────────────────────────────────

const STRIPE_REFERENCE_PREFIX = "stripe:";

/**
 * Run every gate that can be checked without calling Stripe:
 *
 *   1. paymentMethod must be "stripe"
 *   2. paymentReference must start with "stripe:" and contain a session id
 *   3. row must not already be fully refunded
 *   4. amount > 0 and integer cents
 *   5. amount ≤ remaining refundable
 *   6. reason must be non-empty
 *
 * The caller (the server action) is responsible for permission
 * gating and for the Stripe network call. We deliberately keep this
 * helper pure so its rules are trivially testable.
 */
export function validateStripeRefundRequest(
  record: RefundableRecord,
  request: RefundRequest,
): RefundValidationResult {
  // 1) Payment method must be Stripe. We accept the BPM enum value
  //    "stripe" only — other tokens map to manual flows that must
  //    not trigger a Stripe API call.
  if (record.paymentMethod !== "stripe") {
    return fail("NOT_STRIPE_PAYMENT");
  }

  // 2) Reference must be a Stripe checkout session id encoded as
  //    `stripe:<sessionId>`. The fulfillment code paths set this
  //    atomically; if it's missing, the row was likely seeded as
  //    "stripe" without ever going through Stripe.
  const ref = (record.paymentReference ?? "").trim();
  if (!ref.startsWith(STRIPE_REFERENCE_PREFIX)) {
    return fail("MISSING_STRIPE_REFERENCE");
  }
  const stripeSessionId = ref.slice(STRIPE_REFERENCE_PREFIX.length).trim();
  if (!stripeSessionId) {
    return fail("MISSING_STRIPE_REFERENCE");
  }

  // 3) Paid amount is required to compute the refundable cap.
  const paidAmount = record.paidAmountCents;
  if (!Number.isFinite(paidAmount as number) || (paidAmount as number) <= 0) {
    return fail("PAID_AMOUNT_UNKNOWN");
  }

  // 4) Block additional refunds once the row is already fully
  //    refunded — both by status flag (manual refund flow) and by
  //    cumulative amount (Stripe refund flow).
  const refundedSoFar = Math.max(0, Math.floor(record.refundedAmountCents || 0));
  if (record.paymentStatus === "refunded" && refundedSoFar >= (paidAmount as number)) {
    return fail("ALREADY_FULLY_REFUNDED");
  }
  if (refundedSoFar >= (paidAmount as number)) {
    return fail("ALREADY_FULLY_REFUNDED");
  }

  // 5) Amount must be a positive integer number of cents.
  const amount = Math.floor(request.amountCents);
  if (!Number.isFinite(request.amountCents) || amount <= 0) {
    return fail("AMOUNT_INVALID");
  }

  // 6) Cumulative refund must not exceed the original paid amount.
  const remaining = (paidAmount as number) - refundedSoFar;
  if (amount > remaining) {
    return fail("AMOUNT_EXCEEDS_REMAINING");
  }

  // 7) Reason is mandatory — the brief calls it out explicitly so
  //    the audit log always has a justification.
  const reason = (request.reason ?? "").trim();
  if (!reason) {
    return fail("REASON_REQUIRED");
  }

  const newRefunded = refundedSoFar + amount;
  return {
    ok: true,
    amountCents: amount,
    reason,
    newRefundedAmountCents: newRefunded,
    fullRefund: newRefunded >= (paidAmount as number),
    stripeSessionId,
  };
}

function fail(error: RefundValidationError): RefundValidationFail {
  return { ok: false, error, message: REFUND_ERROR_MESSAGES[error] };
}
