/**
 * Fields recorded when staff mark a non-Stripe payment as refunded.
 *
 * Every BPM manual refund path (event "Refund" dialog, subscription
 * "Refunded" payment status) is FULL-refund only: none collects an amount,
 * and partial refunds exist only for Stripe. So the refunded amount is the
 * amount frozen on the row as actually paid — never a live product price.
 *
 * When that frozen amount is unknown, no amount is recorded: the receipt
 * domain then treats the refund as incomplete instead of guessing.
 */
export interface ManualFullRefundFields {
  refundedAt: string;
  refundStatus: "succeeded";
  /** Omitted unless the frozen paid amount is a positive integer. */
  refundedAmountCents?: number;
}

export function manualFullRefundFields(input: {
  /** `price_cents_at_purchase` (subscriptions) or `paid_amount_cents` (events). */
  frozenPaidCents: number | null | undefined;
  refundedAtIso: string;
}): ManualFullRefundFields {
  const paid = input.frozenPaidCents;
  const known = typeof paid === "number" && Number.isInteger(paid) && paid > 0;
  return {
    refundedAt: input.refundedAtIso,
    refundStatus: "succeeded",
    ...(known ? { refundedAmountCents: paid } : {}),
  };
}

/**
 * Clears manual refund data when staff move a non-Stripe subscription out
 * of "refunded" (correcting a mistaken refund), so a recorded amount can
 * never show as returned money on a row that is no longer refunded.
 */
export const CLEARED_MANUAL_REFUND_FIELDS = {
  refundedAt: null,
  refundedBy: null,
  refundReason: null,
  refundedAmountCents: 0,
  refundStatus: null,
} as const;
