import { describe, it, expect } from "vitest";
import {
  applyPricing,
  productMatchesFirstTimeScope,
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
    appliesToEventProductIds: null,
    minPriceCents: null,
    maxDiscountCents: null,
    isActive: true,
    priority: 0,
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

/** Convenience: mark every supplied rule as first-time eligible. */
function eligibleFor(rules: DiscountRule[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const r of rules) {
    if (r.ruleType === "first_time_purchase") out[r.id] = true;
  }
  return out;
}

describe("applyPricing — base behaviour", () => {
  it("returns base unchanged when there are no rules", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.basePriceCents).toBe(17000);
    expect(r.finalPriceCents).toBe(17000);
    expect(r.totalDiscountCents).toBe(0);
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("returns base unchanged when product is free", () => {
    const rules = [rule()];
    const r = applyPricing({
      product: { ...MEMBERSHIP, priceCents: 0 },
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.finalPriceCents).toBe(0);
    expect(r.appliedDiscounts).toEqual([]);
  });
});

describe("applyPricing — first-time rule", () => {
  it("applies the rule when student is first-time", () => {
    const rules = [rule()];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.totalDiscountCents).toBe(1700);
    expect(r.finalPriceCents).toBe(15300);
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1700);
  });

  it("skips the rule when the student has already consumed it", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: { r1: false },
    });
    expect(r.totalDiscountCents).toBe(0);
    expect(r.appliedDiscounts).toEqual([]);
    expect(
      r.reasons.some((s) => s.includes("already consumed this first-time rule")),
    ).toBe(true);
  });

  it("skips a missing eligibility entry (deny-by-default)", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [rule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.appliedDiscounts).toEqual([]);
  });
});

describe("applyPricing — first-time scope", () => {
  const BEGINNERS: PricingProduct = {
    id: "p-beg12",
    productType: "pass",
    priceCents: 10000,
  };
  const YOGA: PricingProduct = {
    id: "p-yoga",
    productType: "pass",
    priceCents: 10000,
  };

  it("matches only the selected products when scope is selected_products", () => {
    const r = rule({
      id: "r-beg",
      firstTimeScope: "selected_products",
      firstTimeProductIds: ["p-beg12"],
    });
    expect(productMatchesFirstTimeScope(r, BEGINNERS)).toBe(true);
    expect(productMatchesFirstTimeScope(r, YOGA)).toBe(false);
  });

  it("skips a scoped rule for an out-of-scope product even when eligible", () => {
    const rules = [
      rule({
        id: "r-beg",
        firstTimeScope: "selected_products",
        firstTimeProductIds: ["p-beg12"],
      }),
    ];
    const r = applyPricing({
      product: YOGA,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: { "r-beg": true },
    });
    expect(r.appliedDiscounts).toEqual([]);
    expect(
      r.reasons.some((s) => s.includes("product not in first-time scope")),
    ).toBe(true);
  });

  it("applies a scoped rule to a matching product", () => {
    const rules = [
      rule({
        id: "r-beg",
        firstTimeScope: "selected_products",
        firstTimeProductIds: ["p-beg12"],
      }),
    ];
    const r = applyPricing({
      product: BEGINNERS,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: { "r-beg": true },
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.ruleId).toBe("r-beg");
  });

  it("two rules with disjoint scopes are independent: an eligible Yoga rule fires on Yoga while the Beginners rule for the same student remains untouched", () => {
    const rules = [
      rule({
        id: "r-beg",
        code: "BEG",
        firstTimeScope: "selected_products",
        firstTimeProductIds: ["p-beg12"],
      }),
      rule({
        id: "r-yoga",
        code: "YOGA",
        firstTimeScope: "selected_products",
        firstTimeProductIds: ["p-yoga"],
      }),
    ];
    const r = applyPricing({
      product: YOGA,
      now: NOW,
      rules,
      studentAffiliations: [],
      // Both rules eligible, but only the Yoga-scoped one matches the product.
      firstTimeEligibleByRuleId: { "r-beg": true, "r-yoga": true },
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.ruleId).toBe("r-yoga");
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
      firstTimeEligibleByRuleId: {},
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
      firstTimeEligibleByRuleId: {},
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
      firstTimeEligibleByRuleId: {},
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
      firstTimeEligibleByRuleId: {},
    });
    expect(expired.appliedDiscounts).toEqual([]);
  });
});

describe("applyPricing — stacking", () => {
  it("applies only the highest-priority non-stackable rule", () => {
    const rules = [
      rule({ id: "r-low", code: "LOW", priority: 1, discountValue: 5 }),
      rule({ id: "r-high", code: "HIGH", priority: 10, discountValue: 20 }),
    ];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.code).toBe("HIGH");
  });

  it("stacks two stackable rules on the remaining base", () => {
    const rules = [
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
    ];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [affiliation({ affiliationType: "hse" })],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    // 17000 - 1700 = 15300 → -1530 = 13770
    expect(r.appliedDiscounts).toHaveLength(2);
    expect(r.totalDiscountCents).toBe(1700 + 1530);
    expect(r.finalPriceCents).toBe(13770);
  });

  it("skips a stackable rule when a non-stackable rule is already applied", () => {
    const rules = [
      rule({ id: "r-ns", code: "NONSTACK", priority: 10, stackable: false }),
      rule({ id: "r-s", code: "STACK", priority: 1, stackable: true }),
    ];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.code).toBe("NONSTACK");
  });
});

describe("applyPricing — gates and caps", () => {
  it("respects min_price_cents", () => {
    const rules = [rule({ minPriceCents: 5000 })];
    const r = applyPricing({
      product: DROP_IN,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("respects max_discount_cents cap", () => {
    const rules = [rule({ discountValue: 50, maxDiscountCents: 1000 })];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1000);
    expect(r.finalPriceCents).toBe(16000);
  });

  it("respects fixed_cents kind", () => {
    const rules = [rule({ discountKind: "fixed_cents", discountValue: 2500 })];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts[0]?.amountCents).toBe(2500);
    expect(r.finalPriceCents).toBe(14500);
  });

  it("respects appliesToProductTypes", () => {
    const rules = [rule({ appliesToProductTypes: ["membership"] })];
    const r = applyPricing({
      product: DROP_IN,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("respects appliesToProductIds", () => {
    const rules = [rule({ appliesToProductIds: ["p-mem-bronze"] })];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("respects rule validity windows", () => {
    const rules = [rule({ validFrom: "2099-01-01T00:00:00Z" })];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("never produces a negative final price", () => {
    const rules = [rule({ discountKind: "fixed_cents", discountValue: 99999 })];
    const r = applyPricing({
      product: DROP_IN,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.finalPriceCents).toBe(0);
    expect(r.totalDiscountCents).toBe(1500);
  });
});

// ── Phase 2 — event-ticket scope ──────────────────────────────

const EVENT_TICKET: PricingProduct = {
  entityKind: "event_product",
  id: "ep-1",
  productType: "full_pass",
  priceCents: 12000,
};

const OTHER_EVENT_TICKET: PricingProduct = {
  entityKind: "event_product",
  id: "ep-2",
  productType: "single_session",
  priceCents: 3000,
};

describe("applyPricing — event-ticket scope (Phase 2)", () => {
  it("affiliation rule scoped to the event ticket applies to a verified student", () => {
    const rules = [
      rule({
        ruleType: "affiliation",
        affiliationType: "hse",
        appliesToEventProductIds: ["ep-1"],
        discountValue: 20,
      }),
    ];
    const r = applyPricing({
      product: EVENT_TICKET,
      now: NOW,
      rules,
      studentAffiliations: [affiliation()],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.totalDiscountCents).toBe(2400);
    expect(r.finalPriceCents).toBe(9600);
  });

  it("does NOT apply when the event ticket is outside the rule scope", () => {
    const rules = [
      rule({
        ruleType: "affiliation",
        affiliationType: "hse",
        appliesToEventProductIds: ["ep-1"],
      }),
    ];
    const r = applyPricing({
      product: OTHER_EVENT_TICKET,
      now: NOW,
      rules,
      studentAffiliations: [affiliation()],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(OTHER_EVENT_TICKET.priceCents);
  });

  it("does NOT apply to events when the rule has no event-ticket scope", () => {
    const rules = [
      rule({
        ruleType: "affiliation",
        affiliationType: "hse",
        appliesToEventProductIds: null,
        appliesToProductTypes: ["membership"],
      }),
    ];
    const r = applyPricing({
      product: EVENT_TICKET,
      now: NOW,
      rules,
      studentAffiliations: [affiliation()],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(EVENT_TICKET.priceCents);
  });

  it("does NOT apply when student lacks a verified affiliation (pending)", () => {
    const rules = [
      rule({
        ruleType: "affiliation",
        affiliationType: "hse",
        appliesToEventProductIds: ["ep-1"],
      }),
    ];
    const r = applyPricing({
      product: EVENT_TICKET,
      now: NOW,
      rules,
      studentAffiliations: [affiliation({ verificationStatus: "pending" })],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(EVENT_TICKET.priceCents);
  });

  it("event-only rule does NOT spill onto subscription products", () => {
    const rules = [
      rule({
        ruleType: "affiliation",
        affiliationType: "hse",
        appliesToEventProductIds: ["ep-1"],
        appliesToProductIds: null,
        appliesToProductTypes: null,
      }),
    ];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [affiliation()],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(MEMBERSHIP.priceCents);
  });

  it("first-time rules are NOT applied to event tickets in Phase 2", () => {
    const rules = [
      rule({
        ruleType: "first_time_purchase",
        appliesToEventProductIds: ["ep-1"],
      }),
    ];
    const r = applyPricing({
      product: EVENT_TICKET,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(EVENT_TICKET.priceCents);
  });
});

describe("snapshotPricingResult", () => {
  it("returns null when no discounts applied", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
    });
    expect(snapshotPricingResult(r, NOW)).toBeNull();
  });

  it("freezes structured snapshot when discounts applied", () => {
    const rules = [rule()];
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules,
      studentAffiliations: [],
      firstTimeEligibleByRuleId: eligibleFor(rules),
    });
    const snap = snapshotPricingResult(r, NOW);
    expect(snap).not.toBeNull();
    expect(snap!.basePriceCents).toBe(17000);
    expect(snap!.finalPriceCents).toBe(15300);
    expect(snap!.appliedDiscounts).toHaveLength(1);
    expect(snap!.appliedDiscounts[0]?.code).toBe("TEST_10");
  });
});

// ── Phase 5 — event promo codes ──────────────────────────────

const PROMO_TICKET: PricingProduct = {
  id: "ep-1",
  entityKind: "event_product",
  productType: "full_pass",
  priceCents: 5000,
};

function promoRule(overrides: Partial<DiscountRule> = {}): DiscountRule {
  return rule({
    id: "r-promo",
    code: "ANGELICA10",
    name: "Angelica's friends 10% off",
    ruleType: "event_promo_code",
    appliesToEventProductIds: [PROMO_TICKET.id],
    requiresCode: true,
    priority: 0,
    discountKind: "percentage",
    discountValue: 10,
    ...overrides,
  });
}

describe("applyPricing — event promo codes", () => {
  it("does NOT apply when no code is entered", () => {
    const r = applyPricing({
      product: PROMO_TICKET,
      now: NOW,
      rules: [promoRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(PROMO_TICKET.priceCents);
  });

  it("does NOT apply when the typed code does not match", () => {
    const r = applyPricing({
      product: PROMO_TICKET,
      now: NOW,
      rules: [promoRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      promoCode: "WRONG",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(PROMO_TICKET.priceCents);
  });

  it("applies when the typed code matches (case-insensitive)", () => {
    const r = applyPricing({
      product: PROMO_TICKET,
      now: NOW,
      rules: [promoRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      promoCode: "angelica10",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.code).toBe("ANGELICA10");
    expect(r.appliedDiscounts[0]?.ruleType).toBe("event_promo_code");
    expect(r.totalDiscountCents).toBe(500);
    expect(r.finalPriceCents).toBe(4500);
  });

  it("does NOT apply when the event ticket is not in the rule's scope", () => {
    const otherTicket: PricingProduct = {
      ...PROMO_TICKET,
      id: "ep-other",
    };
    const r = applyPricing({
      product: otherTicket,
      now: NOW,
      rules: [promoRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      promoCode: "ANGELICA10",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("NEVER applies to a subscription product even when the code matches", () => {
    const r = applyPricing({
      product: MEMBERSHIP,
      now: NOW,
      rules: [promoRule({ appliesToProductIds: [MEMBERSHIP.id] })],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      promoCode: "ANGELICA10",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(MEMBERSHIP.priceCents);
  });

  it("takes precedence over an automatic affiliation discount on the same ticket", () => {
    const affiliationRule = rule({
      id: "r-hse",
      code: "HSE_10",
      ruleType: "affiliation",
      affiliationType: "hse",
      appliesToEventProductIds: [PROMO_TICKET.id],
      // Higher priority than the promo rule — promo should still win
      // because Phase 5 sort puts matched promo rules first.
      priority: 99,
    });
    const promo = promoRule({ priority: 0, discountValue: 25 });
    const r = applyPricing({
      product: PROMO_TICKET,
      now: NOW,
      rules: [affiliationRule, promo],
      studentAffiliations: [affiliation()],
      firstTimeEligibleByRuleId: {},
      promoCode: "ANGELICA10",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.code).toBe("ANGELICA10");
    expect(r.finalPriceCents).toBe(PROMO_TICKET.priceCents - 1250);
  });

  it("does NOT apply when the rule is inactive", () => {
    const r = applyPricing({
      product: PROMO_TICKET,
      now: NOW,
      rules: [promoRule({ isActive: false })],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      promoCode: "ANGELICA10",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("does NOT apply when the rule is expired", () => {
    const r = applyPricing({
      product: PROMO_TICKET,
      now: NOW,
      rules: [promoRule({ validUntil: "2026-04-14T00:00:00Z" })],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      promoCode: "ANGELICA10",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("supports a fixed-amount promo code", () => {
    const r = applyPricing({
      product: PROMO_TICKET,
      now: NOW,
      rules: [
        promoRule({
          discountKind: "fixed_cents",
          discountValue: 1500,
        }),
      ],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      promoCode: "ANGELICA10",
    });
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1500);
    expect(r.finalPriceCents).toBe(3500);
  });
});

// ── Phase 10 — referral rule ─────────────────────────────────

describe("applyPricing — referral rule", () => {
  const BEG_SALSA: PricingProduct = {
    id: "p-latin-combo",
    productType: "pass",
    priceCents: 12000,
    allowedLevels: ["Beginner 1"],
  };
  const BEG_1_2: PricingProduct = {
    id: "p-beg12",
    productType: "pass",
    priceCents: 14000,
    allowedLevels: ["Beginner 1", "Beginner 2"],
  };
  const BEG_BACHATA: PricingProduct = {
    id: "p-bachata-beg",
    productType: "pass",
    priceCents: 12000,
    allowedLevels: ["Beginner 1"],
  };
  const NON_BEGINNER: PricingProduct = {
    id: "p-mem-gold",
    productType: "membership",
    priceCents: 17000,
    allowedLevels: ["Intermediate", "Advanced"],
  };
  const NO_LEVELS: PricingProduct = {
    id: "p-generic",
    productType: "pass",
    priceCents: 10000,
    allowedLevels: null,
  };

  function referralRule(overrides: Partial<DiscountRule> = {}): DiscountRule {
    return rule({
      id: "dr-referral-beginners-10",
      code: "REFERRAL_BEGINNERS_10",
      name: "Referral 10% off Beginners",
      ruleType: "referral",
      discountKind: "percentage",
      discountValue: 10,
      appliesToProductTypes: null,
      appliesToProductIds: null,
      appliesToEventProductIds: null,
      priority: 4,
      stackable: false,
      firstTimeScope: "any_purchase",
      firstTimeProductIds: null,
      ...overrides,
    });
  }

  it("applies 10% off Beginners 1 (Latin Combo) with a referral code", () => {
    const r = applyPricing({
      product: BEG_SALSA,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.ruleType).toBe("referral");
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1200); // 10% of 12000
    expect(r.finalPriceCents).toBe(10800);
  });

  it("applies 10% off Beginners 1 & 2 Combo Pass", () => {
    const r = applyPricing({
      product: BEG_1_2,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1400);
    expect(r.finalPriceCents).toBe(12600);
  });

  it("applies 10% off a Beginners 1 Bachata product (level match — no ID hardcoding)", () => {
    // Product isn't in `appliesToProductIds` — the level-driven
    // predicate is the source of truth and this future/hypothetical
    // beginner product must qualify automatically.
    const r = applyPricing({
      product: BEG_BACHATA,
      now: NOW,
      rules: [referralRule({ appliesToProductIds: null })],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.finalPriceCents).toBe(10800);
  });

  it("does NOT apply to a non-beginner product even with a referral code", () => {
    const r = applyPricing({
      product: NON_BEGINNER,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(NON_BEGINNER.priceCents);
  });

  it("does NOT apply to a product with no allowedLevels metadata", () => {
    const r = applyPricing({
      product: NO_LEVELS,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("does NOT apply when NO referral code is provided", () => {
    const r = applyPricing({
      product: BEG_SALSA,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      // referralCode omitted
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("treats whitespace-only referral code as no code", () => {
    const r = applyPricing({
      product: BEG_SALSA,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "   ",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("does NOT apply on the event branch (subscription-only)", () => {
    const eventTicket: PricingProduct = {
      entityKind: "event_product",
      id: "ep-1",
      productType: "full_pass",
      priceCents: 12000,
      allowedLevels: ["Beginner 1"],
    };
    const r = applyPricing({
      product: eventTicket,
      now: NOW,
      rules: [referralRule({ appliesToEventProductIds: ["ep-1"] })],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("loses to a higher-priority first-time rule (deterministic, no double-discount)", () => {
    // First-time rule (priority 5) + referral rule (priority 4) both
    // eligible; only one applies because both are stackable=false.
    // The engine sorts by priority desc so first-time wins.
    const firstTime = rule({
      id: "dr-first-time",
      code: "FIRST_TIME_10",
      ruleType: "first_time_purchase",
      discountKind: "percentage",
      discountValue: 10,
      appliesToProductIds: [BEG_SALSA.id],
      priority: 5,
      firstTimeScope: "selected_products",
      firstTimeProductIds: [BEG_SALSA.id],
    });
    const r = applyPricing({
      product: BEG_SALSA,
      now: NOW,
      rules: [firstTime, referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: { "dr-first-time": true },
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.ruleType).toBe("first_time_purchase");
    expect(r.totalDiscountCents).toBe(1200); // still 10%, never 20%
  });

  it("applies once the first-time rule has been consumed", () => {
    // Same rules as above but the student has already used the
    // first-time discount elsewhere → referral rule now wins the
    // sole discount slot.
    const firstTime = rule({
      id: "dr-first-time",
      code: "FIRST_TIME_10",
      ruleType: "first_time_purchase",
      discountKind: "percentage",
      discountValue: 10,
      appliesToProductIds: [BEG_SALSA.id],
      priority: 5,
      firstTimeScope: "selected_products",
      firstTimeProductIds: [BEG_SALSA.id],
    });
    const r = applyPricing({
      product: BEG_SALSA,
      now: NOW,
      rules: [firstTime, referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: { "dr-first-time": false },
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.ruleType).toBe("referral");
    expect(r.totalDiscountCents).toBe(1200);
  });

  it("does NOT apply when the rule is inactive", () => {
    const r = applyPricing({
      product: BEG_SALSA,
      now: NOW,
      rules: [referralRule({ isActive: false })],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("rounds the amount to nearest cent for odd subtotals", () => {
    // 12345 * 10% = 1234.5 → rounds to 1235.
    const oddPrice: PricingProduct = {
      ...BEG_SALSA,
      priceCents: 12345,
    };
    const r = applyPricing({
      product: oddPrice,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    expect(r.appliedDiscounts[0]?.amountCents).toBe(1235);
    expect(r.finalPriceCents).toBe(12345 - 1235);
  });

  it("carries the referral snapshot through snapshotPricingResult", () => {
    const r = applyPricing({
      product: BEG_SALSA,
      now: NOW,
      rules: [referralRule()],
      studentAffiliations: [],
      firstTimeEligibleByRuleId: {},
      referralCode: "BPM-1234",
    });
    const snap = snapshotPricingResult(r, NOW);
    expect(snap).not.toBeNull();
    expect(snap?.appliedDiscounts[0]?.ruleType).toBe("referral");
    expect(snap?.finalPriceCents).toBe(10800);
  });
});
