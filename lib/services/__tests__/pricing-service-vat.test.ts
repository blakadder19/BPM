/**
 * Phase 15 — pricing-service VAT integration.
 *
 * Verifies the three things that cannot be checked from the pure
 * `lib/domain/vat.ts` tests alone:
 *
 *   1. VAT is computed on the POST-discount amount, for both the
 *      product and event-ticket entry points.
 *   2. Payment-channel applicability is honoured end-to-end, so
 *      reception prices don't change when online VAT is switched on.
 *   3. The Stripe metadata round-trip preserves the exact figures the
 *      customer was charged, even when the configured rate changes
 *      in between.
 *
 * Settings are mocked because the real store short-circuits to
 * defaults under Vitest (VAT off), which would make every case here
 * a no-op.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockDiscountRule } from "@/lib/mock-data";
import type { AppSettings } from "@/lib/services/settings-store";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/finance-audit-log", () => ({
  logFinanceEvent: vi.fn(),
}));

// ── Mutable settings the tests drive ────────────────────────
let SETTINGS: Partial<AppSettings> = {};

vi.mock("@/lib/services/settings-store", () => ({
  getSettings: () => ({
    vatEnabled: false,
    vatRatePercent: 0,
    vatPriceMode: "exclusive",
    applyVatToOnlinePayments: true,
    applyVatToManualPayments: false,
    ...SETTINGS,
  }),
}));

let RULES: MockDiscountRule[] = [];

vi.mock("@/lib/repositories", () => ({
  getDiscountRuleRepo: () => ({
    async getActive() {
      return RULES.filter((r) => r.isActive);
    },
    async getAll() {
      return [...RULES];
    },
    async getById(id: string) {
      return RULES.find((r) => r.id === id) ?? null;
    },
  }),
  getAffiliationRepo: () => ({ async getByStudent() { return []; } }),
  getSubscriptionRepo: () => ({ async getByStudent() { return []; } }),
  getDiscountClaimRepo: () => ({
    async findActiveForRule() { return null; },
    async tryCreate() { return { granted: true, claim: { id: "claim-1" } }; },
    async setRelated() {},
    async release() {},
  }),
  getSpecialEventRepo: () => ({
    async getAllEvents() { return [{ id: "evt-1", title: "Event" }]; },
    async getPurchasesByEvent() { return []; },
  }),
}));

import {
  priceProductForStudent,
  priceEventTicketForStudent,
  buildVatStripeMetadata,
  readVatFromStripeMetadata,
  serializePricingForStripe,
  deserializePricingFromStripe,
  buildAuditDiscountMetadata,
} from "../pricing-service";

const NOW = "2026-09-15T10:00:00Z";

/**
 * A rule that always fires for a student with no prior purchases.
 * `first_time_purchase` is the simplest unconditional discount to set
 * up here — the mocked subscription repo returns no history, so every
 * test student is first-time eligible.
 */
function percentRule(over: Partial<MockDiscountRule> = {}): MockDiscountRule {
  return {
    id: "dr-20",
    code: "SAVE20",
    name: "20% off",
    description: null,
    ruleType: "first_time_purchase",
    affiliationType: null,
    discountKind: "percentage",
    discountValue: 20,
    appliesToProductTypes: null,
    appliesToProductIds: null,
    appliesToEventProductIds: null,
    minPriceCents: null,
    maxDiscountCents: null,
    stackable: false,
    priority: 10,
    validFrom: null,
    validUntil: null,
    isActive: true,
    firstTimeScope: "any_purchase",
    firstTimeProductIds: null,
    requiresCode: false,
    maxUses: null,
    oneUsePerEmail: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as MockDiscountRule;
}

beforeEach(() => {
  RULES = [];
  SETTINGS = {};
});

// ── 1. VAT disabled → no pricing change at all ──────────────

describe("VAT disabled", () => {
  it("leaves the product price exactly as it was before VAT existed", async () => {
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      now: NOW,
    });
    expect(r.finalPriceCents).toBe(6500);
    expect(r.vat.vatApplied).toBe(false);
    expect(r.vat.vatAmountCents).toBe(0);
    // Callers use totalIncVatCents unconditionally, so it must equal
    // the pre-VAT amount when VAT is off.
    expect(r.vat.totalIncVatCents).toBe(6500);
  });

  it("writes no Stripe VAT metadata whatsoever", async () => {
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      now: NOW,
    });
    expect(buildVatStripeMetadata(r.vat)).toEqual({});
  });

  it("logs no VAT block in the finance audit metadata", async () => {
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      now: NOW,
    });
    // No discounts and no VAT → nothing worth auditing, same as before.
    expect(buildAuditDiscountMetadata(r)).toBeNull();
  });
});

// ── 2. Configurable rates, both modes ───────────────────────

describe("configurable rates", () => {
  it.each([
    [23, 6500, 1495, 7995],
    [20, 6500, 1300, 7800],
    [13.5, 6500, 878, 7378],
    [9, 6500, 585, 7085],
  ])("exclusive %s%% on %i cents → VAT %i, total %i", async (rate, price, vat, total) => {
    SETTINGS = { vatEnabled: true, vatRatePercent: rate, vatPriceMode: "exclusive" };
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: price },
      now: NOW,
    });
    expect(r.vat.vatAmountCents).toBe(vat);
    expect(r.vat.totalIncVatCents).toBe(total);
    expect(r.vat.subtotalExVatCents).toBe(price);
  });

  it("inclusive mode never changes what the customer pays", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23, vatPriceMode: "inclusive" };
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      now: NOW,
    });
    expect(r.vat.totalIncVatCents).toBe(6500);
    expect(r.vat.vatAmountCents).toBe(1215);
    expect(r.vat.subtotalExVatCents).toBe(5285);
    expect(r.vat.subtotalExVatCents + r.vat.vatAmountCents).toBe(6500);
  });

  it("a 0% rate is treated as VAT not applying, even when enabled", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 0 };
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      now: NOW,
    });
    expect(r.vat.vatApplied).toBe(false);
    expect(r.vat.totalIncVatCents).toBe(6500);
  });
});

// ── 3. Discount ordering ────────────────────────────────────

describe("discount applies before VAT", () => {
  it("charges VAT on the discounted amount, not the list price", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    RULES = [percentRule()]; // 20% off
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    expect(r.basePriceCents).toBe(10000);
    expect(r.totalDiscountCents).toBe(2000);
    expect(r.finalPriceCents).toBe(8000);
    // 23% of 8000, NOT of 10000 (which would be 2300).
    expect(r.vat.vatAmountCents).toBe(1840);
    expect(r.vat.totalIncVatCents).toBe(9840);
  });

  it("a referral discount is applied before VAT too", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    RULES = [
      percentRule({
        id: "dr-ref",
        code: "REFERRAL_10",
        ruleType: "referral",
        discountValue: 10,
      }),
    ];
    const r = await priceProductForStudent({
      studentId: "s-1",
      // The referral rule gates on beginner levels, so the product
      // has to carry one for the discount to fire.
      product: {
        id: "p-1",
        productType: "pass",
        priceCents: 10000,
        allowedLevels: ["Beginner 1"],
      },
      referralCode: "FRIEND123",
      now: NOW,
    });
    expect(r.finalPriceCents).toBe(9000);
    expect(r.vat.vatAmountCents).toBe(2070);
    expect(r.vat.totalIncVatCents).toBe(11070);
  });

  it("a 100% discount leaves a €0 total with no VAT", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    RULES = [percentRule({ discountValue: 100 })];
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    expect(r.finalPriceCents).toBe(0);
    expect(r.vat.vatAmountCents).toBe(0);
    expect(r.vat.totalIncVatCents).toBe(0);
    expect(r.vat.vatApplied).toBe(false);
  });
});

// ── 4. Event tickets + promo codes ──────────────────────────

describe("event tickets", () => {
  it("applies VAT to an event ticket after a promo discount", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    RULES = [
      percentRule({
        id: "dr-promo",
        code: "EARLY20",
        ruleType: "event_promo_code",
        requiresCode: true,
        discountValue: 20,
        appliesToEventProductIds: ["ep-1"],
      }),
    ];
    const r = await priceEventTicketForStudent({
      studentId: "s-1",
      product: { id: "ep-1", productType: "full_pass", priceCents: 10000 },
      promoCode: "EARLY20",
      now: NOW,
    });
    expect(r.finalPriceCents).toBe(8000);
    expect(r.vat.vatAmountCents).toBe(1840);
    expect(r.vat.totalIncVatCents).toBe(9840);
  });

  it("applies VAT to a full-price event ticket with no promo", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: { id: "ep-1", productType: "full_pass", priceCents: 10000 },
      now: NOW,
    });
    expect(r.snapshot).toBeNull(); // no discount → no snapshot
    // ...but VAT must still be present, which is exactly why it is
    // carried in flat metadata rather than inside the snapshot.
    expect(r.vat.vatApplied).toBe(true);
    expect(r.vat.vatAmountCents).toBe(2300);
  });
});

// ── 5. Payment-method applicability ─────────────────────────

describe("payment-method applicability", () => {
  it("online payments get VAT, manual payments do not, by default", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };

    const online = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      vatChannel: "online",
      now: NOW,
    });
    const manual = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      vatChannel: "manual",
      now: NOW,
    });

    expect(online.vat.totalIncVatCents).toBe(7995);
    // Reception price is untouched — this is the guarantee Zaria asked
    // for: enabling online VAT must not change what the desk charges.
    expect(manual.vat.totalIncVatCents).toBe(6500);
    expect(manual.vat.vatApplied).toBe(false);
  });

  it("manual payments get VAT once explicitly enabled", async () => {
    SETTINGS = {
      vatEnabled: true,
      vatRatePercent: 23,
      applyVatToManualPayments: true,
    };
    const manual = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      vatChannel: "manual",
      now: NOW,
    });
    expect(manual.vat.totalIncVatCents).toBe(7995);
  });

  it("online VAT can be turned off independently of manual", async () => {
    SETTINGS = {
      vatEnabled: true,
      vatRatePercent: 23,
      applyVatToOnlinePayments: false,
      applyVatToManualPayments: true,
    };
    const online = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 6500 },
      vatChannel: "online",
      now: NOW,
    });
    expect(online.vat.vatApplied).toBe(false);
  });
});

// ── 6. Stripe metadata round-trip ───────────────────────────

describe("Stripe VAT metadata", () => {
  it("writes the five flat keys when VAT applied", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    expect(buildVatStripeMetadata(r.vat)).toEqual({
      bpm_subtotal_ex_vat_cents: "10000",
      bpm_vat_amount_cents: "2300",
      bpm_vat_rate_percent: "23",
      bpm_vat_price_mode: "exclusive",
      bpm_total_inc_vat_cents: "12300",
    });
  });

  it("round-trips the exact figures the customer was charged", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    const meta = buildVatStripeMetadata(r.vat);
    const back = readVatFromStripeMetadata(meta, 0);
    expect(back).toEqual(r.vat);
  });

  it("preserves the ORIGINAL VAT even after the configured rate changes", async () => {
    // Customer checks out at 23%...
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    const atCheckout = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    const meta = buildVatStripeMetadata(atCheckout.vat);

    // ...admin changes the rate to 9% before the webhook lands.
    SETTINGS = { vatEnabled: true, vatRatePercent: 9 };

    const atFulfilment = readVatFromStripeMetadata(meta, 0);
    expect(atFulfilment.vatRatePercent).toBe(23);
    expect(atFulfilment.vatAmountCents).toBe(2300);
    expect(atFulfilment.totalIncVatCents).toBe(12300);
  });

  it("falls back to zero VAT for a session with no VAT keys (legacy/disabled)", () => {
    const back = readVatFromStripeMetadata({ bpm_student_id: "s-1" }, 6500);
    expect(back.vatApplied).toBe(false);
    expect(back.vatAmountCents).toBe(0);
    expect(back.totalIncVatCents).toBe(6500);
  });

  it("rejects inconsistent metadata rather than persisting figures that don't add up", () => {
    const back = readVatFromStripeMetadata(
      {
        bpm_subtotal_ex_vat_cents: "10000",
        bpm_vat_amount_cents: "2300",
        bpm_total_inc_vat_cents: "99999", // does not equal 10000 + 2300
        bpm_vat_rate_percent: "23",
        bpm_vat_price_mode: "exclusive",
      },
      6500,
    );
    expect(back.vatApplied).toBe(false);
    expect(back.totalIncVatCents).toBe(6500);
  });

  it("merges VAT into the rehydrated FrozenPricing alongside the discount snapshot", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    RULES = [percentRule()];
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    const transit = serializePricingForStripe(r)!;
    const meta = buildVatStripeMetadata(r.vat);

    const frozen = await deserializePricingFromStripe(transit, meta);
    expect(frozen).not.toBeNull();
    expect(frozen!.finalPriceCents).toBe(8000);
    expect(frozen!.vat.vatAmountCents).toBe(1840);
    expect(frozen!.vat.totalIncVatCents).toBe(9840);
  });

  it("rehydrates zero VAT when the transit blob is passed without metadata", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    RULES = [percentRule()];
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    const frozen = await deserializePricingFromStripe(serializePricingForStripe(r)!);
    expect(frozen!.vat.vatApplied).toBe(false);
  });
});

// ── 7. Finance audit metadata ───────────────────────────────

describe("finance audit metadata", () => {
  it("includes the frozen VAT snapshot when VAT was charged", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    const meta = buildAuditDiscountMetadata(r);
    expect(meta).not.toBeNull();
    expect(meta!.vat).toEqual({
      subtotalExVatCents: 10000,
      vatAmountCents: 2300,
      vatRatePercent: 23,
      priceMode: "exclusive",
      totalIncVatCents: 12300,
    });
  });

  it("records VAT even on a full-price purchase with no discounts", async () => {
    SETTINGS = { vatEnabled: true, vatRatePercent: 23 };
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    // Pre-VAT this returned null because there were no discounts.
    const meta = buildAuditDiscountMetadata(r);
    expect(meta).not.toBeNull();
    expect((meta!.appliedDiscounts as unknown[]).length).toBe(0);
  });

  it("still returns null when there is neither a discount nor VAT", async () => {
    const r = await priceProductForStudent({
      studentId: "s-1",
      product: { id: "p-1", productType: "membership", priceCents: 10000 },
      now: NOW,
    });
    expect(buildAuditDiscountMetadata(r)).toBeNull();
  });
});
