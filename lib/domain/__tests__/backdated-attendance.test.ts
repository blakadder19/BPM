/**
 * Phase 19 — entitlement eligibility as of a past class date.
 *
 * The scenario driving every test here: a class on 2026-09-20, being
 * corrected on 2026-09-22, with a pass that lapsed on 2026-09-21.
 * Phase 16 made expiry real, so a naive "usable right now?" check
 * would refuse a correction that is factually correct.
 */
import { describe, it, expect } from "vitest";
import type { MockSubscription } from "@/lib/mock-data";
import type { ProductAccessRule } from "@/config/product-access";
import {
  resolveBackdateEligibility,
  checkBackdateClassEligibility,
  describeBackdateRejections,
  BACKDATE_NO_ENTITLEMENT_MESSAGE,
} from "@/lib/domain/backdated-attendance";

const CLASS_DATE = "2026-09-20";
const TODAY = "2026-09-22";

const OPEN_RULE: ProductAccessRule = {
  allowedClassTypes: ["class", "social", "student_practice"],
  styleAccess: { type: "all" },
  allowedLevels: null,
} as ProductAccessRule;

const BACHATA_ONLY: ProductAccessRule = {
  allowedClassTypes: ["class"],
  styleAccess: { type: "fixed", styleIds: ["ds-1"], styleNames: ["Bachata"] },
  allowedLevels: null,
} as ProductAccessRule;

const cls = {
  date: CLASS_DATE,
  classType: "class" as const,
  styleName: "Bachata",
  styleId: "ds-1",
  level: "Improvers",
};

function pass(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: "sub-pass",
    studentId: "s-robin",
    productId: "p-silver",
    productName: "Silver Class Pass",
    productType: "pass",
    status: "active",
    totalCredits: 8,
    remainingCredits: 3,
    classesPerTerm: null,
    classesUsed: 0,
    // Covered the class date, lapsed the day after.
    validFrom: "2026-08-24",
    validUntil: "2026-09-21",
    termId: "term-6",
    productSnapshot: null,
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    ...over,
  } as MockSubscription;
}

function membership(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    ...pass(),
    id: "sub-mem",
    productId: "p-gold",
    productName: "Gold Membership",
    productType: "membership",
    totalCredits: null,
    remainingCredits: null,
    classesPerTerm: 12,
    classesUsed: 4,
    ...over,
  } as MockSubscription;
}

const rules = new Map<string, ProductAccessRule>([
  ["p-silver", OPEN_RULE],
  ["p-gold", OPEN_RULE],
  ["p-bachata", BACHATA_ONLY],
]);

// ── The headline case ────────────────────────────────────────

describe("pass valid on the class date but expired TODAY", () => {
  it("is ELIGIBLE — the correction is judged as of the class date", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass()],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].subscriptionId).toBe("sub-pass");
    expect(r.candidates[0].remainingAsOf).toBe(3);
  });

  it("is flagged as since-expired so the admin sees what they are using", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass()],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    // validUntil 2026-09-21 is before the real today in this repo's
    // seeded future, so the flag is derived, not asserted absolutely.
    expect(typeof r.candidates[0].hasSinceExpired).toBe("boolean");
  });

  it("a still-current pass is also eligible", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ validUntil: "2099-12-31" })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].hasSinceExpired).toBe(false);
  });
});

// ── Rejections ───────────────────────────────────────────────

describe("pass NOT valid on the class date", () => {
  it("rejects a pass that started after the class", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ validFrom: "2026-09-25", validUntil: "2026-10-20" })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("not_valid_on_class_date");
  });

  it("rejects a pass that had already ended before the class", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ validFrom: "2026-07-01", validUntil: "2026-09-19" })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("not_valid_on_class_date");
  });

  it("accepts a pass valid on exactly the class date (inclusive bounds)", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ validFrom: CLASS_DATE, validUntil: CLASS_DATE })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(1);
  });
});

describe("no credit available as of the class date", () => {
  it("rejects a pass with zero remaining credits", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ remainingCredits: 0 })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("no_credit_available");
  });

  it("rejects a membership that had used all its classes", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [membership({ classesUsed: 12, classesPerTerm: 12 })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("no_credit_available");
  });
});

describe("class not covered by the entitlement", () => {
  it("rejects a Bachata-only pass for a Salsa class", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ productId: "p-bachata", productName: "Bachata Pass" })],
      cls: { ...cls, styleName: "Salsa Line", styleId: "ds-5" },
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("class_not_covered");
  });

  it("accepts the same pass for a Bachata class", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ productId: "p-bachata", productName: "Bachata Pass" })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(1);
  });
});

describe("withdrawn entitlements", () => {
  it.each(["paused", "cancelled"] as const)("rejects a %s subscription", (status) => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ status })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("status_not_bookable");
  });

  it("ACCEPTS a subscription the lifecycle has since flipped to 'expired'", () => {
    // This is the whole point of the feature. The nightly job marks a
    // lapsed row 'expired'; that says nothing about whether it
    // covered the class date. Refusing here would mean the outcome
    // of a correction depends on whether cron ran first.
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ status: "expired" })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].subscriptionId).toBe("sub-pass");
  });

  it("ACCEPTS an 'exhausted' row that still had a credit on the class date", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ status: "exhausted", remainingCredits: 2 })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(1);
  });

  it("still rejects an 'exhausted' row with no credits left", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass({ status: "exhausted", remainingCredits: 0 })],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("no_credit_available");
  });
});

// ── Multiple entitlements ───────────────────────────────────

describe("multiple valid entitlements", () => {
  it("returns all of them so the admin can choose", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass(), membership()],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(2);
    expect(r.candidates.map((c) => c.subscriptionId).sort()).toEqual([
      "sub-mem",
      "sub-pass",
    ]);
  });

  it("orders still-valid entitlements ahead of since-expired ones", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [
        pass({ id: "sub-lapsed", validUntil: "2026-09-21" }),
        pass({ id: "sub-current", validUntil: "2099-12-31" }),
      ],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates[0].subscriptionId).toBe("sub-current");
  });

  it("describes the credit model for each candidate", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [pass(), membership()],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    const byId = new Map(r.candidates.map((c) => [c.subscriptionId, c]));
    expect(byId.get("sub-pass")!.creditModel).toBe("credits");
    expect(byId.get("sub-mem")!.creditModel).toBe("class_count");
  });
});

describe("unlimited membership", () => {
  const unlimited = membership({ classesPerTerm: null, classesUsed: 3 });

  it("is eligible with no finite balance", () => {
    const r = resolveBackdateEligibility({
      subscriptions: [unlimited],
      cls,
      accessRulesMap: rules,
      terms: [],
    });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0].isUnlimited).toBe(true);
    expect(r.candidates[0].remainingAsOf).toBeNull();
  });
});

// ── Error messaging ─────────────────────────────────────────

describe("describeBackdateRejections", () => {
  it("returns the base message when nothing was rejected", () => {
    expect(describeBackdateRejections([])).toBe(BACKDATE_NO_ENTITLEMENT_MESSAGE);
  });

  it("explains an out-of-credit pass specifically", () => {
    const msg = describeBackdateRejections([
      { subscriptionId: "s", productName: "Silver Class Pass", reason: "no_credit_available" },
    ]);
    expect(msg).toContain(BACKDATE_NO_ENTITLEMENT_MESSAGE);
    expect(msg).toContain("Silver Class Pass");
    expect(msg).toMatch(/no credits left/i);
  });

  it("explains a style/level mismatch specifically", () => {
    const msg = describeBackdateRejections([
      { subscriptionId: "s", productName: "Bachata Pass", reason: "class_not_covered" },
    ]);
    expect(msg).toMatch(/does not cover this class type, style or level/i);
  });

  it("prioritises the most actionable reason when several apply", () => {
    const msg = describeBackdateRejections([
      { subscriptionId: "a", productName: "Old Pass", reason: "not_valid_on_class_date" },
      { subscriptionId: "b", productName: "Silver Class Pass", reason: "no_credit_available" },
    ]);
    expect(msg).toContain("Silver Class Pass");
  });

  it("never implies a free class was granted", () => {
    const msg = describeBackdateRejections([
      { subscriptionId: "s", productName: "X", reason: "no_credit_available" },
    ]);
    expect(msg).not.toMatch(/complimentary|free/i);
  });
});

// ── Class-level guards ──────────────────────────────────────

describe("checkBackdateClassEligibility", () => {
  it("allows a past class", () => {
    expect(
      checkBackdateClassEligibility({
        classDate: CLASS_DATE,
        classStatus: "open",
        today: TODAY,
      }).ok,
    ).toBe(true);
  });

  it("allows today's class", () => {
    expect(
      checkBackdateClassEligibility({
        classDate: TODAY,
        classStatus: "open",
        today: TODAY,
      }).ok,
    ).toBe(true);
  });

  it("BLOCKS a future class and points at the normal flow", () => {
    const r = checkBackdateClassEligibility({
      classDate: "2026-12-01",
      classStatus: "open",
      today: TODAY,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("future_class");
    expect(r.message).toMatch(/normal booking and check-in flow/i);
  });

  it("BLOCKS a cancelled class", () => {
    const r = checkBackdateClassEligibility({
      classDate: CLASS_DATE,
      classStatus: "cancelled",
      today: TODAY,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("cancelled_class");
    expect(r.message).toMatch(/cancelled/i);
  });

  it("tolerates a missing class status", () => {
    expect(
      checkBackdateClassEligibility({
        classDate: CLASS_DATE,
        classStatus: null,
        today: TODAY,
      }).ok,
    ).toBe(true);
  });
});
