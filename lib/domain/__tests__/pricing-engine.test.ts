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
