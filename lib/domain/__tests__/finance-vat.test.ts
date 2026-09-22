/**
 * Phase 15 — Finance-side VAT reporting.
 *
 * Covers the two things an accountant actually depends on:
 *   1. "VAT collected" is VAT charged MINUS VAT refunded, and a full
 *      refund leaves nothing behind.
 *   2. Rows that predate VAT tracking are excluded, not silently
 *      counted as zero-rated.
 */
import { describe, it, expect } from "vitest";
import {
  computeMetrics,
  buildSubscriptionTransactions,
  buildEventPurchaseTransactions,
  type FinanceTransaction,
} from "@/lib/domain/finance";
import type { MockSubscription, MockEventPurchase } from "@/lib/mock-data";

function tx(over: Partial<FinanceTransaction> = {}): FinanceTransaction {
  return {
    id: "tx-1",
    date: "2026-09-01T10:00:00",
    buyerName: "Ann Doe",
    buyerEmail: "ann@example.com",
    studentId: "s-1",
    source: "subscription",
    productName: "Gold Membership",
    productType: "membership",
    transactionType: "purchase",
    status: "paid",
    amountCents: 12300,
    currency: "EUR",
    paymentMethod: "stripe",
    reference: "stripe:cs_1",
    performedBy: null,
    refundedAt: null,
    refundedBy: null,
    refundReason: null,
    isTest: false,
    refundedAmountCents: 0,
    vatSubtotalExVatCents: 10000,
    vatAmountCents: 2300,
    vatRatePercent: 23,
    vatPriceMode: "exclusive",
    ...over,
  };
}

describe("computeMetrics — VAT collected", () => {
  it("sums VAT across paid transactions", () => {
    const m = computeMetrics([
      tx({ id: "a", amountCents: 12300, vatAmountCents: 2300 }),
      tx({ id: "b", amountCents: 6150, vatAmountCents: 1150, vatSubtotalExVatCents: 5000 }),
    ]);
    expect(m.vatChargedCents).toBe(3450);
    expect(m.vatRefundedCents).toBe(0);
    expect(m.vatCollectedCents).toBe(3450);
  });

  it("net ex-VAT is net revenue minus VAT collected", () => {
    const m = computeMetrics([tx({ amountCents: 12300, vatAmountCents: 2300 })]);
    expect(m.netRevenueCents).toBe(12300);
    expect(m.netExVatCents).toBe(10000);
  });

  it("VAT is zero across the board when no transaction carries VAT", () => {
    const m = computeMetrics([
      tx({ vatAmountCents: null, vatSubtotalExVatCents: null, vatRatePercent: null }),
    ]);
    expect(m.vatChargedCents).toBe(0);
    expect(m.vatCollectedCents).toBe(0);
    // Net ex-VAT collapses to net revenue when nothing carries VAT.
    expect(m.netExVatCents).toBe(m.netRevenueCents);
  });

  it("counts rows with no VAT information rather than treating them as zero-rated", () => {
    const m = computeMetrics([
      tx({ id: "new", vatAmountCents: 2300 }),
      tx({ id: "legacy-1", vatAmountCents: null }),
      tx({ id: "legacy-2", vatAmountCents: null }),
    ]);
    expect(m.transactionsWithoutVatInfo).toBe(2);
    expect(m.vatChargedCents).toBe(2300);
  });

  it("pending transactions contribute no VAT (nothing has been collected yet)", () => {
    const m = computeMetrics([tx({ status: "pending", vatAmountCents: 2300 })]);
    expect(m.vatChargedCents).toBe(0);
    expect(m.vatCollectedCents).toBe(0);
  });
});

describe("computeMetrics — VAT and refunds", () => {
  it("a FULL refund leaves zero VAT counted as collected", () => {
    const m = computeMetrics([
      tx({ status: "refunded", amountCents: 12300, vatAmountCents: 2300, refundedAmountCents: 12300 }),
    ]);
    expect(m.vatChargedCents).toBe(2300);
    expect(m.vatRefundedCents).toBe(2300);
    expect(m.vatCollectedCents).toBe(0);
  });

  it("a PARTIAL refund reverses VAT proportionally while the row stays paid", () => {
    // Half of a €123.00 (incl. €23.00 VAT) purchase refunded.
    const m = computeMetrics([
      tx({ status: "paid", amountCents: 12300, vatAmountCents: 2300, refundedAmountCents: 6150 }),
    ]);
    expect(m.vatChargedCents).toBe(2300);
    expect(m.vatRefundedCents).toBe(1150);
    expect(m.vatCollectedCents).toBe(1150);
  });

  it("mixed book: one clean sale, one fully refunded, one partially refunded", () => {
    const m = computeMetrics([
      tx({ id: "clean", amountCents: 12300, vatAmountCents: 2300 }),
      tx({ id: "full", status: "refunded", amountCents: 12300, vatAmountCents: 2300, refundedAmountCents: 12300 }),
      tx({ id: "partial", status: "paid", amountCents: 12300, vatAmountCents: 2300, refundedAmountCents: 6150 }),
    ]);
    expect(m.vatChargedCents).toBe(6900);
    expect(m.vatRefundedCents).toBe(3450); // 0 + 2300 + 1150
    expect(m.vatCollectedCents).toBe(3450);
  });

  it("a refunded legacy row with no VAT info contributes nothing either way", () => {
    const m = computeMetrics([
      tx({ status: "refunded", amountCents: 10000, vatAmountCents: null, refundedAmountCents: 10000 }),
    ]);
    expect(m.vatChargedCents).toBe(0);
    expect(m.vatRefundedCents).toBe(0);
    expect(m.vatCollectedCents).toBe(0);
  });
});

// ── Transaction builders carry the VAT through ──────────────

function sub(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: "sub-1",
    studentId: "s-1",
    productId: "p-1",
    productName: "Gold Membership",
    productType: "membership",
    status: "active",
    totalCredits: null,
    remainingCredits: null,
    validFrom: "2026-09-01",
    validUntil: "2026-09-28",
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    notes: null,
    termId: "term-1",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    assignedBy: null,
    assignedAt: "2026-09-01T10:00:00",
    autoRenew: false,
    classesUsed: 0,
    classesPerTerm: null,
    renewedFromId: null,
    paidAt: "2026-09-01T10:00:00",
    paymentReference: "stripe:cs_1",
    paymentNotes: null,
    collectedBy: null,
    priceCentsAtPurchase: 12300,
    currencyAtPurchase: "EUR",
    refundedAt: null,
    refundedBy: null,
    refundReason: null,
    stripeRefundId: null,
    refundedAmountCents: 0,
    refundStatus: null,
    productSnapshot: null,
    originalPriceCents: 10000,
    discountAmountCents: 0,
    appliedDiscount: null,
    manualDiscountCents: 0,
    manualDiscountReason: null,
    manualDiscountBy: null,
    subtotalExVatCents: 10000,
    vatAmountCents: 2300,
    vatRatePercent: 23,
    vatPriceMode: "exclusive",
    totalIncVatCents: 12300,
    ...over,
  } as MockSubscription;
}

describe("buildSubscriptionTransactions — VAT passthrough", () => {
  const names = new Map([["s-1", { name: "Ann Doe", email: "ann@example.com" }]]);

  it("copies the frozen VAT snapshot onto the transaction", () => {
    const [t] = buildSubscriptionTransactions([sub()], names);
    expect(t.vatAmountCents).toBe(2300);
    expect(t.vatSubtotalExVatCents).toBe(10000);
    expect(t.vatRatePercent).toBe(23);
    expect(t.vatPriceMode).toBe("exclusive");
    // amountCents remains the VAT-inclusive amount actually paid.
    expect(t.amountCents).toBe(12300);
  });

  it("a legacy row with null VAT columns still loads and reports nulls", () => {
    const [t] = buildSubscriptionTransactions(
      [
        sub({
          subtotalExVatCents: null,
          vatAmountCents: null,
          vatRatePercent: null,
          vatPriceMode: null,
          totalIncVatCents: null,
          priceCentsAtPurchase: 10000,
        }),
      ],
      names,
    );
    expect(t.vatAmountCents).toBeNull();
    expect(t.vatRatePercent).toBeNull();
    expect(t.amountCents).toBe(10000);
  });
});

function evtPurchase(over: Partial<MockEventPurchase> = {}): MockEventPurchase {
  return {
    id: "ep-1",
    studentId: "s-1",
    eventProductId: "epx-1",
    eventId: "evt-1",
    guestName: null,
    guestEmail: null,
    guestPhone: null,
    qrToken: null,
    paymentMethod: "stripe",
    paymentStatus: "paid",
    paymentReference: "stripe:cs_e1",
    receptionMethod: null,
    purchasedAt: "2026-09-01T10:00:00",
    paidAt: "2026-09-01T10:00:00",
    notes: null,
    unitPriceCentsAtPurchase: 10000,
    originalAmountCents: 10000,
    discountAmountCents: 0,
    paidAmountCents: 12300,
    currency: "eur",
    productNameSnapshot: "Weekend Pass",
    productTypeSnapshot: "full_pass",
    appliedDiscount: null,
    checkedInAt: null,
    checkedInBy: null,
    refundedAt: null,
    refundedBy: null,
    refundReason: null,
    stripeRefundId: null,
    refundedAmountCents: 0,
    refundStatus: null,
    lastEmailType: null,
    lastEmailSentAt: null,
    lastEmailSuccess: null,
    subtotalExVatCents: 10000,
    vatAmountCents: 2300,
    vatRatePercent: 23,
    vatPriceMode: "exclusive",
    totalIncVatCents: 12300,
    ...over,
  } as MockEventPurchase;
}

describe("buildEventPurchaseTransactions — VAT passthrough", () => {
  const events = new Map([["evt-1", "Summer Congress"]]);
  const names = new Map([["s-1", { name: "Ann Doe", email: "ann@example.com" }]]);

  it("copies the frozen VAT snapshot onto the transaction", () => {
    const [t] = buildEventPurchaseTransactions([evtPurchase()], events, names);
    expect(t.vatAmountCents).toBe(2300);
    expect(t.vatSubtotalExVatCents).toBe(10000);
    expect(t.amountCents).toBe(12300);
  });

  it("a legacy event purchase with null VAT columns still loads", () => {
    const [t] = buildEventPurchaseTransactions(
      [
        evtPurchase({
          subtotalExVatCents: null,
          vatAmountCents: null,
          vatRatePercent: null,
          vatPriceMode: null,
          totalIncVatCents: null,
          paidAmountCents: 10000,
        }),
      ],
      events,
      names,
    );
    expect(t.vatAmountCents).toBeNull();
    expect(t.amountCents).toBe(10000);
  });

  it("event and subscription VAT aggregate together in one figure", () => {
    const subTxs = buildSubscriptionTransactions([sub()], names);
    const evtTxs = buildEventPurchaseTransactions([evtPurchase()], events, names);
    const m = computeMetrics([...subTxs, ...evtTxs]);
    expect(m.vatCollectedCents).toBe(4600);
  });
});
