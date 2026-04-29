/**
 * Config-level tests for product access rules and event types.
 *
 * Validates that:
 *   - The static config is internally consistent
 *   - Socials cannot be booked and have no penalties/credits
 *   - All finalized product rules work correctly in booking flows
 *   - Every product rule produces a human-readable description
 *   - Credit deduction priority only contains valid product types
 */

import { describe, it, expect } from "vitest";
import {
  PRODUCT_ACCESS_RULES,
  getAccessRule,
  describeAccess,
} from "@/config/product-access";
import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import { CREDIT_DEDUCTION_PRIORITY } from "@/config/business-rules";
import { canAccessClass, type AccessClassContext } from "@/lib/domain/product-access";

// ── Shared contexts ─────────────────────────────────────────

const bachataClass: AccessClassContext = {
  classType: "class",
  danceStyleId: "ds-1",
  level: "Beginner 1",
};

const cubanClass: AccessClassContext = {
  classType: "class",
  danceStyleId: "ds-4",
  level: "Beginner 1",
};

const intermediateClass: AccessClassContext = {
  classType: "class",
  danceStyleId: "ds-1",
  level: "Intermediate",
};

const socialEvent: AccessClassContext = {
  classType: "social",
  danceStyleId: null,
  level: null,
};

const practiceEvent: AccessClassContext = {
  classType: "student_practice",
  danceStyleId: null,
  level: null,
};

// ── Config Consistency ──────────────────────────────────────

describe("Product Access Config — Consistency", () => {
  it("has no duplicate product IDs", () => {
    const ids = PRODUCT_ACCESS_RULES.map((r) => r.productId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every rule has a non-empty productId", () => {
    for (const rule of PRODUCT_ACCESS_RULES) {
      expect(rule.productId.length).toBeGreaterThan(0);
    }
  });

  it("every rule has at least one allowed class type", () => {
    for (const rule of PRODUCT_ACCESS_RULES) {
      expect(rule.allowedClassTypes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("describeAccess returns a non-empty string for every rule", () => {
    for (const rule of PRODUCT_ACCESS_RULES) {
      const desc = describeAccess(rule);
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    }
  });

  it("getAccessRule returns undefined for unknown product ID", () => {
    expect(getAccessRule("nonexistent")).toBeUndefined();
  });
});

// ── Event Type Config ───────────────────────────────────────

describe("Event Type Config — Social & Student Practice", () => {
  it("social is NOT bookable", () => {
    expect(CLASS_TYPE_CONFIG.social.bookable).toBe(false);
  });

  it("social has NO penalties", () => {
    expect(CLASS_TYPE_CONFIG.social.penaltiesApply).toBe(false);
  });

  it("social has NO credits", () => {
    expect(CLASS_TYPE_CONFIG.social.creditsApply).toBe(false);
  });

  it("student_practice is NOT bookable by default", () => {
    expect(CLASS_TYPE_CONFIG.student_practice.bookable).toBe(false);
  });

  it("class type has booking, penalties, and credits enabled", () => {
    expect(CLASS_TYPE_CONFIG.class.bookable).toBe(true);
    expect(CLASS_TYPE_CONFIG.class.penaltiesApply).toBe(true);
    expect(CLASS_TYPE_CONFIG.class.creditsApply).toBe(true);
  });
});

// ── Credit Deduction Priority ───────────────────────────────

describe("Credit Deduction Priority", () => {
  const validTypes = ["membership", "pass", "drop_in"];

  it("contains only valid product types", () => {
    for (const type of CREDIT_DEDUCTION_PRIORITY) {
      expect(validTypes).toContain(type);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(CREDIT_DEDUCTION_PRIORITY).size).toBe(CREDIT_DEDUCTION_PRIORITY.length);
  });

  it("promo_pass is deducted before membership", () => {
    const promoIdx = CREDIT_DEDUCTION_PRIORITY.indexOf("pass");
    const memIdx = CREDIT_DEDUCTION_PRIORITY.indexOf("membership");
    expect(promoIdx).toBeLessThan(memIdx);
  });
});

// ── Social Product ──────────────────────────────────────────

describe("Social Product — Isolation", () => {
  const rule = getAccessRule("p-social")!;

  it("exists in config", () => {
    expect(rule).toBeDefined();
  });

  it("only allows social class type", () => {
    expect(rule.allowedClassTypes).toEqual(["social"]);
  });

  it("uses social_only style access", () => {
    expect(rule.styleAccess.type).toBe("social_only");
  });

  it("cannot access regular classes", () => {
    expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(false);
  });

  it("can access social events", () => {
    expect(canAccessClass(rule, null, null, socialEvent).granted).toBe(true);
  });
});

// ── Student Practice — Member Benefit Access ────────────────

describe("Student Practice — Member Benefit Access", () => {
  const membershipIds = [
    // Active mix-and-match tiers
    "p-mem-bronze", "p-mem-silver", "p-mem-gold", "p-mem-rainbow",
    // Legacy per-style tiers (deactivated but rules retained for historical subscriptions)
    "p-mem-bronze-std", "p-mem-bronze-bach", "p-mem-bronze-salsa", "p-mem-bronze-yoga",
    "p-mem-silver-std", "p-mem-silver-bach", "p-mem-silver-salsa", "p-mem-silver-yoga",
    "p-mem-gold-std", "p-mem-gold-bach", "p-mem-gold-salsa", "p-mem-gold-yoga",
  ];

  it("membership products grant access to student_practice", () => {
    for (const id of membershipIds) {
      const rule = getAccessRule(id)!;
      const result = canAccessClass(rule, null, null, practiceEvent);
      expect(result.granted).toBe(true);
    }
  });

  it("non-membership products do NOT grant access to student_practice", () => {
    for (const rule of PRODUCT_ACCESS_RULES) {
      if (membershipIds.includes(rule.productId)) continue;
      const result = canAccessClass(rule, null, null, practiceEvent);
      expect(result.granted).toBe(false);
    }
  });
});

// ── Finalized Product Rules ─────────────────────────────────

describe("Finalized Product Rules", () => {
  describe("Latin Combo (course_group)", () => {
    const rule = getAccessRule("p-latin-combo")!;

    it("is finalized (not provisional)", () => {
      expect(rule.isProvisional).toBe(false);
    });

    it("grants access when student selected the matching style", () => {
      const result = canAccessClass(rule, null, ["ds-1", "ds-5"], bachataClass);
      expect(result.granted).toBe(true);
    });

    it("denies access for a style NOT in the student's selection", () => {
      const result = canAccessClass(rule, null, ["ds-1", "ds-5"], cubanClass);
      expect(result.granted).toBe(false);
    });

    it("denies access when student selected no styles", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(false);
      expect(canAccessClass(rule, null, [], bachataClass).granted).toBe(false);
    });

    it("respects level restriction (Beginner 1 only)", () => {
      const result = canAccessClass(rule, null, ["ds-1", "ds-5"], intermediateClass);
      expect(result.granted).toBe(false);
    });
  });

  describe("Gold Yoga Pass (yoga-only)", () => {
    const rule = getAccessRule("p-yoga-gold")!;

    it("is finalized (not provisional)", () => {
      expect(rule.isProvisional).toBe(false);
    });

    it("grants access to yoga classes", () => {
      const yogaClass: AccessClassContext = { classType: "class", danceStyleId: "ds-9", level: null };
      expect(canAccessClass(rule, null, null, yogaClass).granted).toBe(true);
    });

    it("denies access to non-yoga classes", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(false);
    });
  });

  describe("Rainbow Membership (all-access)", () => {
    const rule = getAccessRule("p-mem-rainbow")!;

    it("is finalized (not provisional)", () => {
      expect(rule.isProvisional).toBe(false);
    });

    it("grants access to any class style", () => {
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(true);
      expect(canAccessClass(rule, null, null, cubanClass).granted).toBe(true);
    });

    it("grants access to student practice", () => {
      expect(canAccessClass(rule, null, null, practiceEvent).granted).toBe(true);
    });
  });

  describe("other finalized products", () => {
    it("Drop-in (p-dropin) grants access to any class, any level", () => {
      const rule = getAccessRule("p-dropin")!;
      expect(rule.isProvisional).toBe(false);
      expect(canAccessClass(rule, null, null, bachataClass).granted).toBe(true);
      expect(canAccessClass(rule, null, null, intermediateClass).granted).toBe(true);
    });

    it("Beginners 1&2 (p-beg12) requires matching style selection", () => {
      const rule = getAccessRule("p-beg12")!;
      expect(rule.isProvisional).toBe(false);

      expect(canAccessClass(rule, "ds-1", null, bachataClass).granted).toBe(true);
      expect(canAccessClass(rule, "ds-4", null, bachataClass).granted).toBe(false);
    });

    it("Beginners 1&2 (p-beg12) enforces level restriction", () => {
      const rule = getAccessRule("p-beg12")!;
      expect(canAccessClass(rule, "ds-1", null, intermediateClass).granted).toBe(false);
    });
  });
});
