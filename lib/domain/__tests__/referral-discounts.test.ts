import { describe, it, expect } from "vitest";
import {
  isReferralDiscountEligibleProduct,
  calculateReferralDiscountCents,
  validateReferralDiscountApplication,
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_DISCOUNT_LABEL,
  REFERRAL_DISCOUNT_RULE_CODE,
} from "../referral-discounts";
import type { MockStudentReferral } from "@/lib/mock-data";

const NOW = "2026-07-15T10:00:00Z";

function referral(overrides: Partial<MockStudentReferral> = {}): MockStudentReferral {
  return {
    id: "sr-1",
    referrerStudentId: "referrer-1",
    referralCode: "BPM-1234",
    referredStudentId: null,
    referredEmail: null,
    status: "pending",
    verifiedAt: null,
    verifiedBy: null,
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("isReferralDiscountEligibleProduct", () => {
  it("matches Beginner 1", () => {
    expect(
      isReferralDiscountEligibleProduct({ allowedLevels: ["Beginner 1"] }),
    ).toBe(true);
  });

  it("matches Beginner 1 & 2", () => {
    expect(
      isReferralDiscountEligibleProduct({
        allowedLevels: ["Beginner 1", "Beginner 2"],
      }),
    ).toBe(true);
  });

  it("is case-insensitive on the level prefix", () => {
    expect(
      isReferralDiscountEligibleProduct({ allowedLevels: ["beginner 2"] }),
    ).toBe(true);
    expect(
      isReferralDiscountEligibleProduct({ allowedLevels: ["BEGINNER 1"] }),
    ).toBe(true);
  });

  it("does NOT match Intermediate / Advanced products", () => {
    expect(
      isReferralDiscountEligibleProduct({ allowedLevels: ["Intermediate"] }),
    ).toBe(false);
    expect(
      isReferralDiscountEligibleProduct({
        allowedLevels: ["Advanced"],
      }),
    ).toBe(false);
  });

  it("does NOT match products with null / empty allowedLevels", () => {
    expect(isReferralDiscountEligibleProduct({ allowedLevels: null })).toBe(false);
    expect(isReferralDiscountEligibleProduct({ allowedLevels: [] })).toBe(false);
    expect(isReferralDiscountEligibleProduct(undefined)).toBe(false);
    expect(isReferralDiscountEligibleProduct(null)).toBe(false);
  });

  it("does NOT match a product whose only level string contains 'Beginner' but doesn't start with it", () => {
    expect(
      isReferralDiscountEligibleProduct({
        allowedLevels: ["Not-A-Beginner-Class"],
      }),
    ).toBe(false);
  });
});

describe("calculateReferralDiscountCents", () => {
  it("returns 10% of the subtotal", () => {
    expect(calculateReferralDiscountCents(12000)).toBe(1200);
    expect(calculateReferralDiscountCents(14000)).toBe(1400);
  });

  it("rounds to nearest cent for odd subtotals", () => {
    expect(calculateReferralDiscountCents(12345)).toBe(1235); // 1234.5 → 1235
    expect(calculateReferralDiscountCents(9999)).toBe(1000); // 999.9 → 1000
  });

  it("returns 0 for zero / negative / non-finite inputs", () => {
    expect(calculateReferralDiscountCents(0)).toBe(0);
    expect(calculateReferralDiscountCents(-1000)).toBe(0);
    expect(calculateReferralDiscountCents(NaN)).toBe(0);
    expect(calculateReferralDiscountCents(Infinity)).toBe(0);
  });

  it("matches the exported REFERRAL_DISCOUNT_PERCENT constant", () => {
    // Guard: if the constant ever changes, the math should follow.
    expect(REFERRAL_DISCOUNT_PERCENT).toBe(10);
  });
});

describe("validateReferralDiscountApplication", () => {
  const BEG = { allowedLevels: ["Beginner 1"] };
  const NON_BEG = { allowedLevels: ["Intermediate"] };

  it("rejects when no code is provided", () => {
    const r = validateReferralDiscountApplication({
      code: "",
      product: BEG,
      referrerStudentId: null,
      purchaserStudentId: "buyer-1",
      purchaserEmail: null,
      existingReferrals: [],
      subtotalCents: 12000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("no_code");
      expect(r.isReferralValid).toBe(false);
    }
  });

  it("rejects an unknown code with a friendly message", () => {
    const r = validateReferralDiscountApplication({
      code: "BPM-XXX",
      product: BEG,
      referrerStudentId: null,
      purchaserStudentId: "buyer-1",
      purchaserEmail: null,
      existingReferrals: [],
      subtotalCents: 12000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown_code");
      expect(r.message).toContain("couldn't find that referral code");
      expect(r.isReferralValid).toBe(false);
    }
  });

  it("blocks self-referral", () => {
    const r = validateReferralDiscountApplication({
      code: "BPM-1234",
      product: BEG,
      referrerStudentId: "buyer-1",
      purchaserStudentId: "buyer-1",
      purchaserEmail: null,
      existingReferrals: [],
      subtotalCents: 12000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("self_referral");
      expect(r.message).toBe("You can't use your own referral code.");
    }
  });

  it("blocks a duplicate referral by student id", () => {
    const existing = referral({
      referrerStudentId: "referrer-1",
      referredStudentId: "buyer-1",
      status: "pending",
    });
    const r = validateReferralDiscountApplication({
      code: "BPM-1234",
      product: BEG,
      referrerStudentId: "referrer-1",
      purchaserStudentId: "buyer-1",
      purchaserEmail: null,
      existingReferrals: [existing],
      subtotalCents: 12000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("already_referred");
  });

  it("blocks a duplicate referral by email (case-insensitive)", () => {
    const existing = referral({
      referrerStudentId: "referrer-1",
      referredEmail: "Alice@Example.com",
    });
    const r = validateReferralDiscountApplication({
      code: "BPM-1234",
      product: BEG,
      referrerStudentId: "referrer-1",
      purchaserStudentId: null,
      purchaserEmail: "alice@example.com",
      existingReferrals: [existing],
      subtotalCents: 12000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("already_referred");
  });

  it("ignores REJECTED referrals when checking duplicates", () => {
    const rejected = referral({
      referrerStudentId: "referrer-1",
      referredStudentId: "buyer-1",
      status: "rejected",
    });
    const r = validateReferralDiscountApplication({
      code: "BPM-1234",
      product: BEG,
      referrerStudentId: "referrer-1",
      purchaserStudentId: "buyer-1",
      purchaserEmail: null,
      existingReferrals: [rejected],
      subtotalCents: 12000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amountCents).toBe(1200);
  });

  it("returns product_not_eligible for a valid code + non-beginner product", () => {
    const r = validateReferralDiscountApplication({
      code: "BPM-1234",
      product: NON_BEG,
      referrerStudentId: "referrer-1",
      purchaserStudentId: "buyer-1",
      purchaserEmail: null,
      existingReferrals: [],
      subtotalCents: 17000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("product_not_eligible");
      expect(r.isReferralValid).toBe(true); // the code is still valid
      expect(r.message).toContain("beginner products");
    }
  });

  it("returns ok with the 10% cents amount when everything is valid", () => {
    const r = validateReferralDiscountApplication({
      code: "BPM-1234",
      product: BEG,
      referrerStudentId: "referrer-1",
      purchaserStudentId: "buyer-1",
      purchaserEmail: null,
      existingReferrals: [],
      subtotalCents: 12000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.amountCents).toBe(1200);
      expect(r.subtotalCents).toBe(12000);
      expect(r.referrerStudentId).toBe("referrer-1");
    }
  });
});

describe("exported constants", () => {
  it("REFERRAL_DISCOUNT_LABEL matches the UX brief", () => {
    expect(REFERRAL_DISCOUNT_LABEL).toBe("Referral discount (10%)");
  });

  it("REFERRAL_DISCOUNT_RULE_CODE stays REFERRAL_BEGINNERS_10", () => {
    // Changing this breaks the Supabase seed migration + finance
    // filters. Explicit test so a future rename is intentional.
    expect(REFERRAL_DISCOUNT_RULE_CODE).toBe("REFERRAL_BEGINNERS_10");
  });
});
