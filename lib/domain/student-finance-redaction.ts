import type { MockSubscription } from "@/lib/mock-data";

/**
 * Strip money from a subscription for staff without `students:view_finance`.
 *
 * Keeps what reception and teachers need to operate (product, credits,
 * validity, payment status/method, who collected it) and blanks amounts,
 * discounts, VAT, references, notes and refund details.
 */
export function redactSubscriptionFinance(sub: MockSubscription): MockSubscription {
  return {
    ...sub,
    paymentReference: null,
    paymentNotes: null,
    priceCentsAtPurchase: null,
    refundedAt: null,
    refundedBy: null,
    refundReason: null,
    stripeRefundId: null,
    refundedAmountCents: 0,
    refundStatus: null,
    originalPriceCents: null,
    discountAmountCents: 0,
    appliedDiscount: null,
    manualDiscountCents: 0,
    manualDiscountReason: null,
    manualDiscountBy: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    vatPriceMode: null,
    totalIncVatCents: null,
  };
}
