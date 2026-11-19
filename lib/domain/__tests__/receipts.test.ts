import { describe, expect, it } from "vitest";
import {
  RECEIPT_REFERENCE_BITS,
  buildReceiptData,
  evaluateReceiptEligibility,
  eventPaymentMethodLabel,
  formatReceiptReference,
  noPaymentLabel,
  normalizeReceiptAmounts,
  subscriptionPaymentMethodLabel,
  toCustomerSafePaymentReference,
  type EventPurchaseReceiptRow,
  type ReceiptSource,
  type SubscriptionReceiptRow,
} from "../receipts";
import {
  EMPTY_RECEIPT_BUSINESS_SETTINGS,
  hasConfiguredVatNumber,
  normalizeReceiptBusinessSettings,
  resolveReceiptIssuer,
} from "../receipt-settings";

const SUB_ID = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const EVT_ID = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const NO_VAT_NUMBER = { businessHasVatNumber: false };
const WITH_VAT_NUMBER = { businessHasVatNumber: true };

function sub(over: Partial<SubscriptionReceiptRow> = {}): SubscriptionReceiptRow {
  return {
    id: SUB_ID,
    paymentStatus: "paid",
    paymentMethod: "stripe",
    paidAt: "2026-10-01T10:00:00.000Z",
    assignedAt: "2026-09-30T09:00:00.000Z",
    priceCentsAtPurchase: 5500,
    currencyAtPurchase: "EUR",
    originalPriceCents: 5500,
    discountAmountCents: 0,
    productNameSnapshot: "Bronze Class Pass",
    productTypeSnapshot: "pass",
    productName: "Bronze Class Pass (renamed)",
    productType: "pass",
    paymentReference: "stripe:cs_live_abc",
    refundedAt: null,
    refundedAmountCents: 0,
    refundStatus: null,
    stripeRefundId: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    vatPriceMode: null,
    totalIncVatCents: null,
    ...over,
  };
}

function evt(over: Partial<EventPurchaseReceiptRow> = {}): EventPurchaseReceiptRow {
  return {
    id: EVT_ID,
    studentId: null,
    guestName: "Guest Person",
    guestEmail: "guest@example.com",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    receptionMethod: null,
    paidAt: "2026-10-05T18:00:00.000Z",
    purchasedAt: "2026-10-05T17:59:00.000Z",
    paidAmountCents: 9000,
    originalAmountCents: 9000,
    discountAmountCents: 0,
    currency: "eur",
    productNameSnapshot: "Beginners Course",
    productTypeSnapshot: "full_pass",
    eventTitleSnapshot: "Beginners Salsa & Bachata",
    paymentReference: "stripe:cs_live_evt",
    refundedAt: null,
    refundedAmountCents: 0,
    refundStatus: null,
    stripeRefundId: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    vatPriceMode: null,
    totalIncVatCents: null,
    ...over,
  };
}

const student = { name: "Student Person", email: "student@example.com" };
const subSource = (over: Partial<SubscriptionReceiptRow> = {}): ReceiptSource => ({
  kind: "subscription",
  row: sub(over),
  customer: student,
});
const evtSource = (over: Partial<EventPurchaseReceiptRow> = {}, extra: Partial<Extract<ReceiptSource, { kind: "event_purchase" }>> = {}): ReceiptSource => ({
  kind: "event_purchase",
  row: evt(over),
  ...extra,
});

function built(source: ReceiptSource, ctx = NO_VAT_NUMBER) {
  const r = buildReceiptData(source, ctx);
  if (!r.ok) throw new Error(`expected a receipt, got ${r.reason}`);
  return r.receipt;
}

// ── Eligibility ─────────────────────────────────────────────

describe("receipt eligibility — subscriptions", () => {
  it("paid with an amount > 0 is eligible", () => {
    expect(evaluateReceiptEligibility(subSource())).toEqual({ eligible: true });
  });

  it("pending is not eligible", () => {
    expect(evaluateReceiptEligibility(subSource({ paymentStatus: "pending" }))).toEqual({
      eligible: false,
      reason: "payment_pending",
    });
  });

  it("cancelled payment is not eligible", () => {
    expect(evaluateReceiptEligibility(subSource({ paymentStatus: "cancelled" }))).toEqual({
      eligible: false,
      reason: "payment_cancelled",
    });
  });

  it("an unexpected stored status fails closed instead of throwing", () => {
    const badSub = subSource({ paymentStatus: "chargeback" as never });
    expect(evaluateReceiptEligibility(badSub)).toEqual({ eligible: false, reason: "payment_status_unknown" });
    const badEvent: ReceiptSource = { kind: "event_purchase", row: evt({ paymentStatus: "cancelled" as never }) };
    expect(evaluateReceiptEligibility(badEvent)).toEqual({ eligible: false, reason: "payment_status_unknown" });
  });

  it.each(["complimentary", "waived"] as const)("%s is not eligible even though the list price is stored", (status) => {
    const source = subSource({ paymentStatus: status, paymentMethod: "complimentary", priceCentsAtPurchase: 5500 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "no_payment_taken" });
    expect(noPaymentLabel(source)).toBe("Complimentary — no payment taken");
  });

  it("paid at €0 after a discount is not eligible", () => {
    const source = subSource({ priceCentsAtPurchase: 0, originalPriceCents: 5500, discountAmountCents: 5500 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "no_payment_taken" });
    expect(noPaymentLabel(source)).toBe("€0 after discount — no payment taken");
  });

  it("missing frozen amount is not eligible", () => {
    expect(evaluateReceiptEligibility(subSource({ priceCentsAtPurchase: null }))).toEqual({
      eligible: false,
      reason: "amount_unknown",
    });
  });

  it("refunded via Stripe with complete refund data is eligible", () => {
    const source = subSource({
      paymentStatus: "refunded",
      refundedAt: "2026-10-10T12:00:00.000Z",
      refundedAmountCents: 5500,
      refundStatus: "succeeded",
      stripeRefundId: "re_1",
    });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: true });
  });

  it("refunded manually with a €0 refund amount is NOT read as a full refund — no receipt", () => {
    const source = subSource({ paymentStatus: "refunded", paymentMethod: "cash", refundedAt: "2026-10-10T12:00:00.000Z", refundedAmountCents: 0 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
    expect(buildReceiptData(source, NO_VAT_NUMBER)).toEqual({ ok: false, reason: "refund_data_incomplete" });
  });

  it.each([null, undefined, -500, 12.5])("refunded manually with an unknown/invalid refund amount (%s) is not eligible", (amount) => {
    const source = subSource({
      paymentStatus: "refunded",
      paymentMethod: "manual",
      refundedAt: "2026-10-10T12:00:00.000Z",
      refundedAmountCents: amount as number,
    });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("refunded manually with a recorded amount but no refund date is not eligible (no date is fabricated)", () => {
    const source = subSource({ paymentStatus: "refunded", paymentMethod: "cash", refundedAt: null, refundedAmountCents: 5500 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("refunded manually with a trustworthy recorded amount and date is eligible with that exact refund", () => {
    const r = built(subSource({ paymentStatus: "refunded", paymentMethod: "cash", refundedAt: "2026-10-10T12:00:00.000Z", refundedAmountCents: 5500 }));
    expect(r.refund).toEqual({ refundedAmountCents: 5500, refundedAt: "2026-10-10T12:00:00.000Z", fullRefund: true });
    expect(r.netPaidCents).toBe(0);
  });

  it("refunded manually with a recorded amount below the total is not eligible (rest unrecorded)", () => {
    const source = subSource({ paymentStatus: "refunded", paymentMethod: "cash", refundedAt: "2026-10-10T12:00:00.000Z", refundedAmountCents: 3000 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("refunded via Stripe with an amount but no confirmed status (legacy) is not eligible", () => {
    const source = subSource({ paymentStatus: "refunded", refundedAt: "2026-10-10T12:00:00.000Z", refundedAmountCents: 5500, refundStatus: null, stripeRefundId: "re_1" });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("a paid row carrying an amount from a failed Stripe refund (pre-23A bug shape) is not eligible", () => {
    const source = subSource({ refundedAmountCents: 2000, refundedAt: "2026-10-10T12:00:00.000Z", refundStatus: "failed", stripeRefundId: "re_x" });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("the known legacy shape — refunded, no refund amount, no refund date, no paid_at — is not eligible", () => {
    const source = subSource({ paymentStatus: "refunded", paidAt: null, refundedAt: null, refundedAmountCents: 0 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("refunded Stripe row with no confirmed amount is not eligible", () => {
    const source = subSource({ paymentStatus: "refunded", refundedAt: "2026-10-10T12:00:00.000Z", refundedAmountCents: 0 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it.each(["pending", "failed"] as const)("refunded with a %s Stripe refund is not eligible", (refundStatus) => {
    const source = subSource({
      paymentStatus: "refunded",
      refundedAt: "2026-10-10T12:00:00.000Z",
      refundedAmountCents: 5500,
      refundStatus,
      stripeRefundId: "re_1",
    });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_not_confirmed" });
  });

  it("refunded after only a partial Stripe refund is not eligible (rest of the refund unrecorded)", () => {
    const source = subSource({
      paymentStatus: "refunded",
      refundedAt: "2026-10-10T12:00:00.000Z",
      refundedAmountCents: 2000,
      refundStatus: "succeeded",
      stripeRefundId: "re_1",
    });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("subscription lifecycle status plays no part (the row type does not even carry it)", () => {
    expect(evaluateReceiptEligibility(subSource())).toEqual({ eligible: true });
  });

  it("a customer without a name is not eligible", () => {
    expect(evaluateReceiptEligibility({ kind: "subscription", row: sub(), customer: { name: "  ", email: null } })).toEqual({
      eligible: false,
      reason: "customer_identity_missing",
    });
  });

  it("a non-UUID source id is not eligible", () => {
    expect(evaluateReceiptEligibility(subSource({ id: "sub-01" }))).toEqual({ eligible: false, reason: "invalid_source_id" });
  });
});

describe("receipt eligibility — event purchases", () => {
  it("paid with paid_amount > 0 is eligible", () => {
    expect(evaluateReceiptEligibility(evtSource())).toEqual({ eligible: true });
  });

  it("free registration (paid, €0, no list price) is not eligible", () => {
    const source = evtSource({ paidAmountCents: 0, originalAmountCents: 0 });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "no_payment_taken" });
    expect(noPaymentLabel(source)).toBe("Free registration");
  });

  it("100%-discount ticket (paid, €0 after discount) is not eligible", () => {
    const source = evtSource({ paidAmountCents: 0, originalAmountCents: 5500, discountAmountCents: 5500, paymentReference: "comp:abc" });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "no_payment_taken" });
    expect(noPaymentLabel(source)).toBe("€0 after discount — no payment taken");
  });

  it("refunded with complete successful refund data is eligible", () => {
    const source = evtSource({
      paymentStatus: "refunded",
      refundedAt: "2026-10-07T09:00:00.000Z",
      refundedAmountCents: 9000,
      refundStatus: "succeeded",
      stripeRefundId: "re_2",
    });
    const r = built(source);
    expect(r.refund).toEqual({ refundedAmountCents: 9000, refundedAt: "2026-10-07T09:00:00.000Z", fullRefund: true });
    expect(r.netPaidCents).toBe(0);
  });

  it("manual reception refund that stored only a refund date (€0 amount) is not eligible", () => {
    const source = evtSource({
      paymentStatus: "refunded",
      paymentMethod: "manual",
      receptionMethod: "cash",
      refundedAt: "2026-10-07T09:00:00.000Z",
      refundedAmountCents: 0,
    });
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: false, reason: "refund_data_incomplete" });
  });

  it("pending is not eligible", () => {
    expect(evaluateReceiptEligibility(evtSource({ paymentStatus: "pending" }))).toEqual({
      eligible: false,
      reason: "payment_pending",
    });
  });

  it("a guest receipt uses only the guest name and email frozen on the purchase", () => {
    const r = built(evtSource({}, { customer: { name: "Someone Else", email: "else@example.com" } }));
    expect(r.customerKind).toBe("guest");
    expect(r.customerName).toBe("Guest Person");
    expect(r.customerEmail).toBe("guest@example.com");
    expect(JSON.stringify(r)).not.toContain("guestPhone");
  });

  it("a logged-in purchase uses the account identity", () => {
    const r = built(evtSource({ studentId: "s-1", guestName: null, guestEmail: null }, { customer: student }));
    expect(r.customerKind).toBe("student");
    expect(r.customerName).toBe("Student Person");
  });

  it("a guest purchase without a guest name is not eligible", () => {
    expect(evaluateReceiptEligibility(evtSource({ guestName: null }))).toEqual({
      eligible: false,
      reason: "customer_identity_missing",
    });
  });
});

// ── Amounts ─────────────────────────────────────────────────

describe("receipt amounts", () => {
  it("prints list price and discount when they reconcile with the amount paid", () => {
    const r = built(subSource({ priceCentsAtPurchase: 4500, originalPriceCents: 5500, discountAmountCents: 1000 }));
    expect(r.originalAmountCents).toBe(5500);
    expect(r.discountAmountCents).toBe(1000);
    expect(r.totalPaidCents).toBe(4500);
    expect(r.warnings).toEqual([]);
  });

  it("does not double-count a manual discount already inside discount_amount_cents", () => {
    // Production shape: manual €15 discount, engine discount 0, discount_amount = 1500.
    const row = { ...sub({ priceCentsAtPurchase: 4000, originalPriceCents: 5500, discountAmountCents: 1500 }), manualDiscountCents: 1500 };
    const r = built({ kind: "subscription", row, customer: student });
    expect(r.discountAmountCents).toBe(1500);
    expect(r.totalPaidCents).toBe(4000);
    expect(r.warnings).not.toContain("amount_breakdown_inconsistent");
  });

  it("uses only the frozen total: a different live product price is irrelevant", () => {
    const r = built(subSource({ priceCentsAtPurchase: 4500, originalPriceCents: 5500, discountAmountCents: 1000, productName: "Now €99" }));
    expect(r.totalPaidCents).toBe(4500);
    expect(r.itemName).toBe("Bronze Class Pass");
  });

  const exclusiveVat = {
    priceCentsAtPurchase: 6765,
    originalPriceCents: 5500,
    discountAmountCents: 0,
    subtotalExVatCents: 5500,
    vatAmountCents: 1265,
    vatRatePercent: 23,
    vatPriceMode: "exclusive" as const,
    totalIncVatCents: 6765,
  };

  it("exclusive VAT snapshot + configured VAT number → full breakdown", () => {
    const r = built(subSource(exclusiveVat), WITH_VAT_NUMBER);
    expect(r.vatBreakdownDisplayable).toBe(true);
    expect(r).toMatchObject({ originalAmountCents: 5500, subtotalExVatCents: 5500, vatAmountCents: 1265, vatRatePercent: 23, totalPaidCents: 6765 });
  });

  it("exclusive VAT snapshot without a VAT number → Total paid only (no VAT lines, no ex-VAT list price)", () => {
    const r = built(subSource(exclusiveVat), NO_VAT_NUMBER);
    expect(r.vatBreakdownDisplayable).toBe(false);
    expect(r).toMatchObject({
      originalAmountCents: null,
      discountAmountCents: null,
      subtotalExVatCents: null,
      vatAmountCents: null,
      vatRatePercent: null,
      totalPaidCents: 6765,
    });
  });

  it("NULL VAT is never treated as zero or recomputed", () => {
    const r = built(subSource(), WITH_VAT_NUMBER);
    expect(r.vatBreakdownDisplayable).toBe(false);
    expect(r.vatAmountCents).toBeNull();
    expect(r.vatRatePercent).toBeNull();
    expect(r.totalPaidCents).toBe(5500);
  });

  it("an inconsistent snapshot falls back to Total paid only, with a warning, without rewriting figures", () => {
    const source = subSource({ priceCentsAtPurchase: 5000, originalPriceCents: 5500, discountAmountCents: 1000 });
    const r = built(source);
    expect(r.totalPaidCents).toBe(5000);
    expect(r.originalAmountCents).toBeNull();
    expect(r.discountAmountCents).toBeNull();
    expect(r.warnings).toContain("amount_breakdown_inconsistent");
    if (source.kind === "subscription") expect(source.row.priceCentsAtPurchase).toBe(5000);
  });

  it("a VAT snapshot whose total disagrees with the amount paid is suppressed", () => {
    const r = built(subSource({ ...exclusiveVat, totalIncVatCents: 6700 }), WITH_VAT_NUMBER);
    expect(r.vatBreakdownDisplayable).toBe(false);
    expect(r.warnings).toContain("amount_breakdown_inconsistent");
  });

  it("a partial VAT snapshot is suppressed", () => {
    const r = built(subSource({ vatAmountCents: 1265 }), WITH_VAT_NUMBER);
    expect(r.vatBreakdownDisplayable).toBe(false);
    expect(r.warnings).toEqual(expect.arrayContaining(["vat_snapshot_partial", "amount_breakdown_inconsistent"]));
  });

  it("event exclusive VAT: original is ex-VAT, paid includes VAT", () => {
    const r = built(
      evtSource({
        paidAmountCents: 11070,
        originalAmountCents: 9000,
        subtotalExVatCents: 9000,
        vatAmountCents: 2070,
        vatRatePercent: 23,
        vatPriceMode: "exclusive",
        totalIncVatCents: 11070,
      }),
      WITH_VAT_NUMBER,
    );
    expect(r).toMatchObject({ vatBreakdownDisplayable: true, totalPaidCents: 11070, vatAmountCents: 2070 });
  });

  it("inclusive VAT without a VAT number still shows list/discount (they add up to the gross total)", () => {
    const n = normalizeReceiptAmounts(
      {
        totalPaidCents: 4500,
        originalAmountCents: 5500,
        discountAmountCents: 1000,
        subtotalExVatCents: 3659,
        vatAmountCents: 841,
        vatRatePercent: 23,
        vatPriceMode: "inclusive",
        totalIncVatCents: 4500,
      },
      NO_VAT_NUMBER,
    );
    expect(n).toMatchObject({ originalAmountCents: 5500, discountAmountCents: 1000, vatBreakdownDisplayable: false, vatAmountCents: null });
  });

  it("partial confirmed refund nets off; status stays paid", () => {
    const r = built(subSource({ refundedAmountCents: 2000, refundedAt: "2026-10-12T10:00:00.000Z", refundStatus: "succeeded", stripeRefundId: "re_3" }));
    expect(r.refund).toEqual({ refundedAmountCents: 2000, refundedAt: "2026-10-12T10:00:00.000Z", fullRefund: false });
    expect(r.netPaidCents).toBe(3500);
  });

  it("a pending Stripe refund on a paid row is not shown as returned money", () => {
    const r = built(subSource({ refundStatus: "pending", stripeRefundId: "re_4" }));
    expect(r.refund).toBeNull();
    expect(r.netPaidCents).toBe(5500);
    expect(r.warnings).toContain("refund_pending_not_included");
  });
});

// ── Dates ───────────────────────────────────────────────────

describe("payment recorded on", () => {
  it("uses paid_at when present", () => {
    const r = built(subSource());
    expect(r.paymentRecordedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(r.paymentRecordedAtSource).toBe("paid_at");
  });

  it("falls back to assigned_at for subscriptions without paid_at", () => {
    const r = built(subSource({ paidAt: null, paymentMethod: "revolut" }));
    expect(r.paymentRecordedAt).toBe("2026-09-30T09:00:00.000Z");
    expect(r.paymentRecordedAtSource).toBe("assigned_at");
  });

  it("uses event paid_at", () => {
    const r = built(evtSource());
    expect(r.paymentRecordedAt).toBe("2026-10-05T18:00:00.000Z");
    expect(r.paymentRecordedAtSource).toBe("paid_at");
  });

  it("falls back to purchased_at for an event without paid_at, with a warning", () => {
    const r = built(evtSource({ paidAt: null }));
    expect(r.paymentRecordedAtSource).toBe("purchased_at");
    expect(r.warnings).toContain("payment_date_from_purchased_at");
  });

  it("no date at all is not eligible", () => {
    expect(evaluateReceiptEligibility(subSource({ paidAt: null, assignedAt: "" }))).toEqual({
      eligible: false,
      reason: "payment_date_unknown",
    });
  });
});

// ── Labels, references, identity ────────────────────────────

describe("payment method labels", () => {
  it("manual subscription payments are 'Recorded by BPM', never inferred", () => {
    expect(subscriptionPaymentMethodLabel("manual")).toBe("Recorded by BPM");
    expect(subscriptionPaymentMethodLabel("stripe")).toBe("Card (online)");
    expect(subscriptionPaymentMethodLabel("cash")).toBe("Cash");
    expect(subscriptionPaymentMethodLabel("revolut")).toBe("Revolut");
  });

  it("event manual payments use reception_method when it names the method", () => {
    expect(eventPaymentMethodLabel("manual", "cash")).toBe("Cash");
    expect(eventPaymentMethodLabel("manual", "revolut")).toBe("Revolut");
    expect(eventPaymentMethodLabel("manual", null)).toBe("Recorded by BPM");
    expect(eventPaymentMethodLabel("manual", "something else")).toBe("Recorded by BPM");
    expect(eventPaymentMethodLabel("stripe", null)).toBe("Card (online)");
  });
});

describe("customer-safe payment reference", () => {
  it.each([
    "stripe:cs_live_a1b2c3",
    "comp:3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f",
    "Paid by bf at desk, owes €5",
    "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f",
  ])("hides %s", (ref) => {
    expect(toCustomerSafePaymentReference(ref)).toBeNull();
  });

  it("the receipt never carries the raw stored reference", () => {
    expect(built(subSource()).paymentReference).toBeNull();
  });
});

describe("item identity", () => {
  it("prefers the frozen product name over the live one", () => {
    expect(built(subSource()).itemName).toBe("Bronze Class Pass");
  });

  it("falls back to the live name only for pre-00082 rows, flagged", () => {
    const r = built(subSource({ productNameSnapshot: null, productTypeSnapshot: null }));
    expect(r.itemName).toBe("Bronze Class Pass (renamed)");
    expect(r.warnings).toContain("item_name_from_live_product");
  });

  it("event item comes from the frozen product name; the frozen event title is the secondary label", () => {
    const r = built(evtSource());
    expect(r.itemName).toBe("Beginners Course");
    expect(r.itemSecondaryLabel).toBe("Beginners Salsa & Bachata");
  });

  it("renaming the event after purchase does not change the receipt", () => {
    const row = evt();
    const before = built({ kind: "event_purchase", row });
    // A rename touches only the event record; the purchase row keeps its snapshot,
    // and the receipt source has no way to receive the live title.
    const liveEvent = { id: "evt-1", title: "Beginners Salsa & Bachata" };
    liveEvent.title = "RENAMED — Summer Intensive";
    const after = built({ kind: "event_purchase", row });
    expect(after).toEqual(before);
    expect(after.itemSecondaryLabel).toBe("Beginners Salsa & Bachata");
    expect(JSON.stringify(after)).not.toContain(liveEvent.title);
  });

  it("an event purchase without a frozen title (pre-00082 row) has no receipt — never a live fallback", () => {
    for (const eventTitleSnapshot of [null, undefined, "   "]) {
      expect(evaluateReceiptEligibility(evtSource({ eventTitleSnapshot }))).toEqual({
        eligible: false,
        reason: "event_title_missing",
      });
    }
  });

  it("subscriptions carry no term name, validity window or style label (none of them is frozen)", () => {
    const r = built(subSource());
    expect(r.itemSecondaryLabel).toBeNull();
    // Even if a caller passes live mutable fields, the receipt ignores them.
    const tainted = {
      kind: "subscription",
      row: { ...sub(), termName: "Term 3 (renamed)", validUntil: "2027-01-01", selectedStyleNames: ["Bachata"] },
      customer: student,
      termName: "Term 3 (renamed)",
    } as unknown as ReceiptSource;
    const t = built(tainted);
    expect(t).toEqual(r);
    expect(JSON.stringify(t)).not.toMatch(/Term 3|2027-01-01|Bachata/);
  });
});

describe("receipt reference", () => {
  it("is deterministic and stable", () => {
    expect(formatReceiptReference("subscription", SUB_ID)).toBe(formatReceiptReference("subscription", SUB_ID));
    expect(formatReceiptReference("subscription", SUB_ID.toUpperCase())).toBe(formatReceiptReference("subscription", SUB_ID));
  });

  it("uses BPM-S / BPM-E prefixes and 16 Crockford characters", () => {
    expect(formatReceiptReference("subscription", SUB_ID)).toMatch(/^BPM-S-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(formatReceiptReference("event_purchase", EVT_ID)).toMatch(/^BPM-E-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  });

  it("carries at least 80 bits of the UUID", () => {
    expect(RECEIPT_REFERENCE_BITS).toBeGreaterThanOrEqual(80);
  });

  it("does not expose the raw UUID", () => {
    const ref = formatReceiptReference("subscription", SUB_ID);
    expect(ref.toLowerCase()).not.toContain(SUB_ID.slice(0, 8));
    expect(ref).not.toContain(SUB_ID);
  });

  it("changes when any carried hex digit changes (no two ids share a reference unless those 80 bits match)", () => {
    const hex = SUB_ID.replace(/-/g, "");
    const carried = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 17, 18, 19, 20, 21];
    const base = formatReceiptReference("subscription", SUB_ID);
    for (const pos of carried) {
      const flipped = hex.slice(0, pos) + (hex[pos] === "0" ? "1" : "0") + hex.slice(pos + 1);
      const uuid = `${flipped.slice(0, 8)}-${flipped.slice(8, 12)}-${flipped.slice(12, 16)}-${flipped.slice(16, 20)}-${flipped.slice(20)}`;
      expect(formatReceiptReference("subscription", uuid), `hex position ${pos}`).not.toBe(base);
    }
  });

  it("does not depend on product data", () => {
    expect(built(subSource({ productNameSnapshot: "A" })).reference).toBe(built(subSource({ productNameSnapshot: "B" })).reference);
  });

  it("rejects non-UUID ids", () => {
    expect(() => formatReceiptReference("subscription", "sub-01")).toThrow();
  });
});

// ── Business settings ───────────────────────────────────────

describe("receipt business settings", () => {
  it("defaults to nothing configured", () => {
    expect(Object.values(EMPTY_RECEIPT_BUSINESS_SETTINGS).every((v) => v === null)).toBe(true);
    expect(hasConfiguredVatNumber(EMPTY_RECEIPT_BUSINESS_SETTINGS)).toBe(false);
  });

  it("normalises: trims, drops blanks, non-strings and unknown keys", () => {
    const s = normalizeReceiptBusinessSettings({ tradingName: "  BPM  ", vatNumber: " ", phone: 123, extra: "x" });
    expect(s.tradingName).toBe("BPM");
    expect(s.vatNumber).toBeNull();
    expect(s.phone).toBeNull();
    expect("extra" in s).toBe(false);
    expect(normalizeReceiptBusinessSettings(null)).toEqual(EMPTY_RECEIPT_BUSINESS_SETTINGS);
  });

  it("issuer prints configured fields only, and falls back to the existing trading name", () => {
    const issuer = resolveReceiptIssuer(EMPTY_RECEIPT_BUSINESS_SETTINGS, "Balance Power Motion");
    expect(issuer.displayName).toBe("Balance Power Motion");
    expect(issuer.addressLines).toEqual([]);
    expect(issuer.contactEmail).toBeNull();
    expect(issuer.vatNumber).toBeNull();
  });

  it("builds address lines from configured parts only", () => {
    const s = normalizeReceiptBusinessSettings({ addressLine1: "1 Main St", city: "Dublin", postcode: "D01 X2Y3", country: "Ireland" });
    expect(resolveReceiptIssuer(s, null).addressLines).toEqual(["1 Main St", "Dublin D01 X2Y3", "Ireland"]);
  });

  it("a VAT number unlocks the VAT breakdown flag", () => {
    expect(hasConfiguredVatNumber(normalizeReceiptBusinessSettings({ vatNumber: "IE1234567X" }))).toBe(true);
  });
});
