import { describe, it, expect } from "vitest";
import type { MockTerm } from "@/lib/mock-data";
import {
  classifyExpiryMode,
  computeSubscriptionValidity,
  validateSubscriptionExtension,
  addDaysISO,
  type ValidityProduct,
} from "@/lib/domain/subscription-validity";

function makeTerm(overrides: Partial<MockTerm> = {}): MockTerm {
  return {
    id: "term-5",
    name: "Term 5",
    startDate: "2026-07-20",
    endDate: "2026-08-16",
    status: "active",
    notes: null,
    ...overrides,
  } as MockTerm;
}

function makeProduct(overrides: Partial<ValidityProduct> = {}): ValidityProduct {
  return {
    id: "p-silver",
    productType: "pass",
    termBound: true,
    spanTerms: 1,
    durationDays: null,
    ...overrides,
  };
}

// ── classifier ────────────────────────────────────────────────

describe("classifyExpiryMode", () => {
  it("returns term_end for termBound products", () => {
    expect(classifyExpiryMode(makeProduct({ termBound: true }))).toBe("term_end");
  });

  it("returns fixed_duration when not term-bound but has durationDays", () => {
    expect(
      classifyExpiryMode(makeProduct({ termBound: false, durationDays: 28 })),
    ).toBe("fixed_duration");
  });

  it("returns open_ended when neither term-bound nor duration set", () => {
    expect(
      classifyExpiryMode(makeProduct({ termBound: false, durationDays: null })),
    ).toBe("open_ended");
  });

  it("returns open_ended when durationDays is 0", () => {
    expect(
      classifyExpiryMode(makeProduct({ termBound: false, durationDays: 0 })),
    ).toBe("open_ended");
  });

  it("prefers term_end over durationDays when both are set (legacy misconfig)", () => {
    // Real-world case: a product that has BOTH termBound=true and
    // durationDays=56 (the current Beginners 1+2 promo pass). The
    // classifier must never use durationDays when termBound wins.
    expect(
      classifyExpiryMode(makeProduct({ termBound: true, durationDays: 56 })),
    ).toBe("term_end");
  });
});

// ── computeSubscriptionValidity — term-based branches ────────

describe("computeSubscriptionValidity — term-based passes/memberships", () => {
  it("Silver Class Pass bought late in Term 5 expires on Term 5's endDate", () => {
    // The exact scenario Zaria reported: purchase on 2026-07-24,
    // 4 days into Term 5. Old durationDays-only logic would have
    // produced 2026-08-21, carrying into Term 6. Correct answer:
    // Term 5's endDate = 2026-08-16.
    const result = computeSubscriptionValidity({
      product: makeProduct({ id: "p-silver-class", termBound: true }),
      purchaseDate: "2026-07-24",
      chosenTerm: makeTerm({ id: "term-5", startDate: "2026-07-20", endDate: "2026-08-16" }),
      nextConsecutiveTerm: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validity.mode).toBe("term_end");
    expect(result.validity.validFrom).toBe("2026-07-20");
    expect(result.validity.validUntil).toBe("2026-08-16");
    expect(result.validity.termId).toBe("term-5");
    expect(result.validity.assignedTermName).toBe("Term 5");
  });

  it("term-based membership expires at the selected term's endDate", () => {
    const result = computeSubscriptionValidity({
      product: makeProduct({ id: "p-mem-gold", productType: "membership", termBound: true }),
      purchaseDate: "2026-04-01",
      chosenTerm: makeTerm({ id: "term-1", startDate: "2026-03-30", endDate: "2026-04-26" }),
      nextConsecutiveTerm: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validity.validUntil).toBe("2026-04-26");
  });

  it("next-term purchase (bought during Term 4, chose Term 5) expires at Term 5 end", () => {
    const result = computeSubscriptionValidity({
      product: makeProduct({ termBound: true }),
      purchaseDate: "2026-07-10",
      chosenTerm: makeTerm({ id: "term-5", startDate: "2026-07-20", endDate: "2026-08-16" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validity.validFrom).toBe("2026-07-20");
    expect(result.validity.validUntil).toBe("2026-08-16");
  });

  it("spanTerms >= 2 product expires at the NEXT consecutive term's endDate", () => {
    const result = computeSubscriptionValidity({
      product: makeProduct({ id: "p-beg12", termBound: true, spanTerms: 2 }),
      purchaseDate: "2026-03-30",
      chosenTerm: makeTerm({
        id: "term-1",
        name: "Term 1",
        startDate: "2026-03-30",
        endDate: "2026-04-26",
      }),
      nextConsecutiveTerm: makeTerm({
        id: "term-2",
        name: "Term 2",
        startDate: "2026-04-27",
        endDate: "2026-05-24",
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validity.validUntil).toBe("2026-05-24");
    expect(result.validity.assignedTermName).toBe("Term 1 + Term 2");
  });

  it("spanTerms >= 2 without a next term returns a clear error", () => {
    const result = computeSubscriptionValidity({
      product: makeProduct({ termBound: true, spanTerms: 2 }),
      purchaseDate: "2026-11-10",
      chosenTerm: makeTerm({ id: "term-9", startDate: "2026-11-09", endDate: "2026-12-06" }),
      nextConsecutiveTerm: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("span_term_missing_next");
  });

  it("term-based product without a chosen term returns a clear error (never silently rolls)", () => {
    const result = computeSubscriptionValidity({
      product: makeProduct({ termBound: true, durationDays: 56 }),
      purchaseDate: "2026-07-24",
      chosenTerm: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("term_bound_without_term");
  });

  it("rejects malformed term where endDate < startDate", () => {
    const result = computeSubscriptionValidity({
      product: makeProduct({ termBound: true }),
      purchaseDate: "2026-07-24",
      chosenTerm: makeTerm({ startDate: "2026-08-20", endDate: "2026-08-10" }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("term_end_before_start");
  });
});

// ── fixed-duration + open-ended branches ─────────────────────

describe("computeSubscriptionValidity — non-term-based products", () => {
  it("preserves durationDays behaviour for a rolling pass", () => {
    // Legacy 30-day rolling pass: still valid for drop-in / pack
    // style products. Purchase on 2026-07-24 → 2026-08-23.
    const result = computeSubscriptionValidity({
      product: makeProduct({
        id: "p-drop30",
        termBound: false,
        durationDays: 30,
      }),
      purchaseDate: "2026-07-24",
      chosenTerm: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validity.mode).toBe("fixed_duration");
    expect(result.validity.validFrom).toBe("2026-07-24");
    expect(result.validity.validUntil).toBe("2026-08-23");
    expect(result.validity.termId).toBeNull();
  });

  it("open-ended drop-in credit pack has null validUntil", () => {
    const result = computeSubscriptionValidity({
      product: makeProduct({
        id: "p-dropin",
        productType: "drop_in",
        termBound: false,
        durationDays: null,
      }),
      purchaseDate: "2026-07-24",
      chosenTerm: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validity.mode).toBe("open_ended");
    expect(result.validity.validUntil).toBeNull();
  });

  it("if admin pins a rolling product to a term, term_end wins", () => {
    // Safety net: even if a product is misconfigured as
    // termBound=false, an explicit term at purchase time must
    // still prevent over-run into the next term.
    const result = computeSubscriptionValidity({
      product: makeProduct({
        termBound: false,
        durationDays: 28,
      }),
      purchaseDate: "2026-07-24",
      chosenTerm: makeTerm({ id: "term-5", startDate: "2026-07-20", endDate: "2026-08-16" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.validity.mode).toBe("term_end");
    expect(result.validity.validUntil).toBe("2026-08-16");
  });
});

// ── addDaysISO ───────────────────────────────────────────────

describe("addDaysISO", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysISO("2026-07-24", 30)).toBe("2026-08-23");
  });
  it("adds days across a year boundary", () => {
    expect(addDaysISO("2026-12-15", 20)).toBe("2027-01-04");
  });
  it("handles zero-day extension (same date)", () => {
    expect(addDaysISO("2026-07-24", 0)).toBe("2026-07-24");
  });
});

// ── validateSubscriptionExtension ────────────────────────────

describe("validateSubscriptionExtension", () => {
  it("accepts a valid extension after current expiry with a reason", () => {
    const r = validateSubscriptionExtension({
      currentValidUntil: "2026-08-16",
      newValidUntil: "2026-09-13",
      reason: "Student was hospitalised — missed 2 weeks",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects when reason is empty", () => {
    const r = validateSubscriptionExtension({
      currentValidUntil: "2026-08-16",
      newValidUntil: "2026-09-13",
      reason: "   ",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("missing_reason");
  });

  it("rejects when newValidUntil equals currentValidUntil (no-op)", () => {
    const r = validateSubscriptionExtension({
      currentValidUntil: "2026-08-16",
      newValidUntil: "2026-08-16",
      reason: "typo",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("not_after_current");
  });

  it("rejects when newValidUntil is BEFORE currentValidUntil (shortening)", () => {
    const r = validateSubscriptionExtension({
      currentValidUntil: "2026-08-16",
      newValidUntil: "2026-08-01",
      reason: "shorten",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("not_after_current");
  });

  it("rejects when subscription has no current expiry (open-ended)", () => {
    const r = validateSubscriptionExtension({
      currentValidUntil: null,
      newValidUntil: "2026-09-13",
      reason: "extend",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("no_current_expiry");
  });

  it("rejects a malformed date input", () => {
    const r = validateSubscriptionExtension({
      currentValidUntil: "2026-08-16",
      newValidUntil: "not-a-date",
      reason: "extend",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("invalid_date");
  });
});
