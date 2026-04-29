import { describe, it, expect } from "vitest";
import {
  applyPricing,
  snapshotPricingResult,
  type DiscountRule,
  type StudentAffiliation,
  type PricingProduct,
} from "../pricing-engine";

const NOW = "2026-04-15T10:00:00Z";

function rule(overrides: Partial<DiscountRule> = {}): DiscountRule {
  return {
    id: "r1",
    code: "TEST_10",
    name: "Test 10%",
    description: null,
    ruleType: "first_time_purchase",
    affiliationType: null,
    discountKind: "percentage",
    discountValue: 10,
    appliesToProductTypes: null,
    appliesToProductIds: null,
    minPriceCents: null,
    maxDiscountCents: null,
    isActive: true,
    priority: 0,
    stackable: false,
    validFrom: null,
    validUntil: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function affiliation(overrides: Partial<StudentAffiliation> = {}): StudentAffiliation {
  return {
    id: "aff-1",
    studentId: "stu-1",
    affiliationType: "hse",
    verificationStatus: "verified",
    verifiedAt: NOW,
    verifiedBy: "admin-1",
    metadata: {},
    validFrom: null,
    validUntil: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const MEMBERSHIP: PricingProduct = {
  id: "p-mem-gold",
  productType: "membership",
  priceCents: 17000,
};
const DROP_IN: PricingProduct = {
  id: "p-dropin",
  productType: "drop_in",
  priceCents: 1500,
};

describe("applyPricing — base behaviour", () => {
  it("returns base unchanged when there are no rules", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [],
      studentAffiliations: [],
      isFirstTimePurchase: false,
    });
    expect(r.basePriceCents).toBe(17000);
    expect(r.finalPriceCents).toBe(17000);
    expect(r.totalDiscountCents).toBe(0);
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("returns base unchanged when product is free", () => {
    const r = applyPricing({
      product: { ...MEMBERSHIP, priceCents: 0 },
      now: NOW,
      rules: [rule()],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.finalPriceCents).toBe(0);
    expect(r.appliedDiscounts).toEqual([]);
  });
});

describe("applyPricing — first-time rule", () => {
  it("applies the rule when student is first-time", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule()],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.totalDiscountCents).toBe(1700);
    expect(r.finalPriceCents).toBe(15300);
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1700);
  });

  it("skips the rule when student is not first-time", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule()],
      studentAffiliations: [],
      isFirstTimePurchase: false,
    });
    expect(r.totalDiscountCents).toBe(0);
    expect(r.appliedDiscounts).toEqual([]);
    expect(r.reasons.some((s) => s.includes("not first-time"))).toBe(true);
  });
});

describe("applyPricing — affiliation rule", () => {
  it("applies when student has a matching verified affiliation", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [
        rule({
          id: "r-hse",
          code: "HSE_10",
          ruleType: "affiliation",
          affiliationType: "hse",
        }),
      ],
      studentAffiliations: [affiliation({ affiliationType: "hse" })],
      isFirstTimePurchase: false,
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.affiliationId).toBe("aff-1");
    expect(r.appliedDiscounts[0]?.affiliationType).toBe("hse");
  });

  it("skips when affiliation is pending (not verified)", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [
        rule({
          ruleType: "affiliation",
          affiliationType: "hse",
        }),
      ],
      studentAffiliations: [
        affiliation({ affiliationType: "hse", verificationStatus: "pending" }),
      ],
      isFirstTimePurchase: false,
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("skips when the affiliation type does not match", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [
        rule({
          ruleType: "affiliation",
          affiliationType: "hse",
        }),
      ],
      studentAffiliations: [affiliation({ affiliationType: "gardai" })],
      isFirstTimePurchase: false,
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("respects the affiliation row's validity window", () => {
    const expired = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule({ ruleType: "affiliation", affiliationType: "hse" })],
      studentAffiliations: [
        affiliation({ affiliationType: "hse", validUntil: "2026-01-01T00:00:00Z" }),
      ],
      isFirstTimePurchase: false,
    });
    expect(expired.appliedDiscounts).toEqual([]);
  });
});

describe("applyPricing — stacking", () => {
  it("applies only the highest-priority non-stackable rule", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [
        rule({ id: "r-low", code: "LOW", priority: 1, discountValue: 5 }),
        rule({ id: "r-high", code: "HIGH", priority: 10, discountValue: 20 }),
      ],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.code).toBe("HIGH");
  });

  it("stacks two stackable rules on the remaining base", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [
        rule({
          id: "r-a",
          code: "A_10",
          ruleType: "first_time_purchase",
          discountValue: 10,
          stackable: true,
          priority: 5,
        }),
        rule({
          id: "r-b",
          code: "B_HSE",
          ruleType: "affiliation",
          affiliationType: "hse",
          discountValue: 10,
          stackable: true,
          priority: 1,
        }),
      ],
      studentAffiliations: [affiliation({ affiliationType: "hse" })],
      isFirstTimePurchase: true,
    });
    // 17000 - 1700 = 15300 → -1530 = 13770
    expect(r.appliedDiscounts).toHaveLength(2);
    expect(r.totalDiscountCents).toBe(1700 + 1530);
    expect(r.finalPriceCents).toBe(13770);
  });

  it("skips a stackable rule when a non-stackable rule is already applied", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [
        rule({ id: "r-ns", code: "NONSTACK", priority: 10, stackable: false }),
        rule({ id: "r-s", code: "STACK", priority: 1, stackable: true }),
      ],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.code).toBe("NONSTACK");
  });
});

describe("applyPricing — gates and caps", () => {
  it("respects min_price_cents", () => {
    const r = applyPricing({
      product: DROP_IN,
      now: NOW,
      rules: [rule({ minPriceCents: 5000 })],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("respects max_discount_cents cap", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule({ discountValue: 50, maxDiscountCents: 1000 })],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1000);
    expect(r.finalPriceCents).toBe(16000);
  });

  it("respects fixed_cents kind", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule({ discountKind: "fixed_cents", discountValue: 2500 })],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts[0]?.amountCents).toBe(2500);
    expect(r.finalPriceCents).toBe(14500);
  });

  it("respects appliesToProductTypes", () => {
    const r = applyPricing({
      product: DROP_IN,
      now: NOW,
      rules: [rule({ appliesToProductTypes: ["membership"] })],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("respects appliesToProductIds", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule({ appliesToProductIds: ["p-mem-bronze"] })],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("respects rule validity windows", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule({ validFrom: "2099-01-01T00:00:00Z" })],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("never produces a negative final price", () => {
    const r = applyPricing({
      product: DROP_IN,
      now: NOW,
      rules: [rule({ discountKind: "fixed_cents", discountValue: 99999 })],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    expect(r.finalPriceCents).toBe(0);
    expect(r.totalDiscountCents).toBe(1500);
  });
});

describe("snapshotPricingResult", () => {
  it("returns null when no discounts applied", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [],
      studentAffiliations: [],
      isFirstTimePurchase: false,
    });
    expect(snapshotPricingResult(r, NOW)).toBeNull();
  });

  it("freezes structured snapshot when discounts applied", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule()],
      studentAffiliations: [],
      isFirstTimePurchase: true,
    });
    const snap = snapshotPricingResult(r, NOW);
    expect(snap).not.toBeNull();
    expect(snap!.basePriceCents).toBe(17000);
    expect(snap!.finalPriceCents).toBe(15300);
    expect(snap!.appliedDiscounts).toHaveLength(1);
    expect(snap!.appliedDiscounts[0]?.code).toBe("TEST_10");
  });
});
