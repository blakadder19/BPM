/**
 * Phase 10 — pricing-service tests for the referral discount.
 *
 * Verifies that `priceProductForStudent` correctly threads the
 * purchaser's referral code through to the pricing engine, resulting
 * in a 10% discount on beginner products, plus the Stripe metadata
 * round-trip (serialize → deserialize) preserves the referral entry
 * verbatim.
 *
 * Mirrors the existing `pricing-service-promo-codes.test.ts` scaffold.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockDiscountRule } from "@/lib/mock-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/finance-audit-log", () => ({
  logFinanceEvent: vi.fn(),
}));

let RULES: MockDiscountRule[] = [];

function resetState() {
  RULES = [];
}

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
  getAffiliationRepo: () => ({
    async getByStudent() {
      return [];
    },
  }),
  getSubscriptionRepo: () => ({
    async getByStudent() {
      return [];
    },
  }),
  getDiscountClaimRepo: () => ({
    async findActiveForRule() {
      return null;
    },
    async tryCreate() {
      return { granted: true, claim: { id: "claim-1" } };
    },
    async setRelated() {},
    async release() {},
  }),
}));

import {
  priceProductForStudent,
  previewPricingForStudent,
  serializePricingForStripe,
  deserializePricingFromStripe,
} from "../pricing-service";

const NOW = "2026-07-15T10:00:00Z";

function referralRule(overrides: Partial<MockDiscountRule> = {}): MockDiscountRule {
  return {
    id: "dr-referral-beginners-10",
    code: "REFERRAL_BEGINNERS_10",
    name: "Referral 10% off Beginners",
    description: null,
    ruleType: "referral",
    affiliationType: null,
    discountKind: "percentage",
    discountValue: 10,
    appliesToProductTypes: null,
    appliesToProductIds: null,
    appliesToEventProductIds: null,
    minPriceCents: null,
    maxDiscountCents: null,
    isActive: true,
    priority: 4,
    stackable: false,
    validFrom: null,
    validUntil: null,
    firstTimeScope: "any_purchase",
    firstTimeProductIds: null,
    requiresCode: false,
    maxUses: null,
    oneUsePerEmail: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const BEG_PRODUCT = {
  id: "p-latin-combo",
  productType: "pass" as const,
  priceCents: 12000,
  allowedLevels: ["Beginner 1"],
};

const NON_BEG_PRODUCT = {
  id: "p-mem-gold",
  productType: "membership" as const,
  priceCents: 17000,
  allowedLevels: ["Intermediate"],
};

describe("priceProductForStudent — referral discount", () => {
  beforeEach(() => {
    resetState();
    RULES.push(referralRule());
  });

  it("applies 10% off a beginner product when a referral code is supplied", async () => {
    const r = await priceProductForStudent({
      studentId: "buyer-1",
      product: BEG_PRODUCT,
      now: NOW,
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.ruleType).toBe("referral");
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1200);
    expect(r.finalPriceCents).toBe(10800);
  });

  it("does NOT apply without a referral code", async () => {
    const r = await priceProductForStudent({
      studentId: "buyer-1",
      product: BEG_PRODUCT,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(12000);
  });

  it("does NOT apply to non-beginner products even with a referral code", async () => {
    const r = await priceProductForStudent({
      studentId: "buyer-1",
      product: NON_BEG_PRODUCT,
      now: NOW,
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(17000);
  });

  it("also fires in commit mode (Stripe / reception path) without an atomic claim", async () => {
    // Referral is NOT a first-time discount — commit mode should not
    // create a claim row for it.
    const r = await priceProductForStudent({
      studentId: "buyer-1",
      product: BEG_PRODUCT,
      now: NOW,
      referralCode: "BPM-1234",
      commit: { source: "catalog_purchase" },
    });
    expect(r.finalPriceCents).toBe(10800);
    expect(r.claim).toBeNull();
    expect(r.firstTimeDenied).toBe(false);
  });

  it("previewPricingForStudent surfaces the referral discount for display", async () => {
    const map = await previewPricingForStudent({
      studentId: "buyer-1",
      products: [BEG_PRODUCT, NON_BEG_PRODUCT],
      now: NOW,
      referralCode: "BPM-1234",
    });
    expect(map.get(BEG_PRODUCT.id)?.finalPriceCents).toBe(10800);
    expect(map.get(NON_BEG_PRODUCT.id)?.finalPriceCents).toBe(17000);
  });

  it("Stripe transit round-trip preserves the referral discount entry", async () => {
    const r = await priceProductForStudent({
      studentId: "buyer-1",
      product: BEG_PRODUCT,
      now: NOW,
      referralCode: "BPM-1234",
    });
    const transit = serializePricingForStripe(r);
    expect(transit).not.toBeNull();
    const restored = await deserializePricingFromStripe(transit!);
    expect(restored).not.toBeNull();
    expect(restored!.finalPriceCents).toBe(10800);
    expect(restored!.appliedDiscounts).toHaveLength(1);
    expect(restored!.appliedDiscounts[0]?.ruleType).toBe("referral");
    expect(restored!.appliedDiscounts[0]?.amountCents).toBe(1200);
    // The Stripe transit is compact (drops the reason string); the
    // rehydrated `name` comes from the rule lookup so the finance
    // snapshot stays readable even after the rule is renamed.
    expect(restored!.appliedDiscounts[0]?.name).toBe(
      "Referral 10% off Beginners",
    );
  });
});
