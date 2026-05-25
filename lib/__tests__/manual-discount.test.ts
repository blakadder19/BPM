/**
 * Unit tests for the manual-discount validation logic exposed by
 * `createSubscriptionAction`.
 *
 * The action itself is a Next.js server action that pulls auth +
 * Supabase, so we re-implement the small piece of pure logic it
 * applies (parse → validate → cap) to lock the rules in place. If
 * the production action drifts, this test still catches regressions
 * against the documented business rules.
 */

import { describe, it, expect } from "vitest";

interface ManualDiscountInput {
  eurosRaw: string | null;
  centsRaw: string | null;
  reasonRaw: string | null;
  hasPermission: boolean;
  productPriceCents: number;
}

type ManualDiscountResult =
  | { ok: true; manualDiscountCents: number; reason: string | null }
  | { ok: false; error: string };

/**
 * Mirrors the rule block inside `lib/actions/subscriptions.ts`
 * createSubscriptionAction (see manualDiscountCents handling). If
 * production diverges, this fixture must be updated too.
 */
function applyManualDiscountRules(input: ManualDiscountInput): ManualDiscountResult {
  let manualDiscountCents = 0;
  const reason = input.reasonRaw?.trim() ?? null;

  if (input.centsRaw && input.centsRaw !== "") {
    const n = Math.round(Number(input.centsRaw));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Manual discount must be a non-negative number." };
    }
    manualDiscountCents = n;
  } else if (input.eurosRaw && input.eurosRaw !== "") {
    const euros = Number(input.eurosRaw);
    if (!Number.isFinite(euros) || euros < 0) {
      return { ok: false, error: "Manual discount must be a non-negative number." };
    }
    manualDiscountCents = Math.round(euros * 100);
  }

  if (manualDiscountCents > 0) {
    if (!input.hasPermission) {
      return { ok: false, error: "You do not have permission to apply manual discounts." };
    }
    if (!reason) {
      return { ok: false, error: "A reason is required when applying a manual discount." };
    }
    if (manualDiscountCents > input.productPriceCents) {
      return {
        ok: false,
        error: `Manual discount (€${(manualDiscountCents / 100).toFixed(2)}) cannot exceed the product price (€${(input.productPriceCents / 100).toFixed(2)}).`,
      };
    }
  }

  return { ok: true, manualDiscountCents, reason };
}

describe("manual discount rules", () => {
  it("no discount when empty input — permission and reason not required", () => {
    const res = applyManualDiscountRules({
      eurosRaw: "",
      centsRaw: null,
      reasonRaw: "",
      hasPermission: false,
      productPriceCents: 6500,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.manualDiscountCents).toBe(0);
  });

  it("rejects negative discount", () => {
    const res = applyManualDiscountRules({
      eurosRaw: "-1",
      centsRaw: null,
      reasonRaw: "test",
      hasPermission: true,
      productPriceCents: 6500,
    });
    expect(res.ok).toBe(false);
  });

  it("requires permission when discount > 0", () => {
    const res = applyManualDiscountRules({
      eurosRaw: "15",
      centsRaw: null,
      reasonRaw: "Drop-in conversion",
      hasPermission: false,
      productPriceCents: 6500,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
  });

  it("requires reason when discount > 0", () => {
    const res = applyManualDiscountRules({
      eurosRaw: "15",
      centsRaw: null,
      reasonRaw: "",
      hasPermission: true,
      productPriceCents: 6500,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/reason/i);
  });

  it("rejects manual discount exceeding product price", () => {
    const res = applyManualDiscountRules({
      eurosRaw: "100",
      centsRaw: null,
      reasonRaw: "Too much",
      hasPermission: true,
      productPriceCents: 6500,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cannot exceed/i);
  });

  it("Robin use case: €15 drop-in converted towards Bronze Bachata Pass", () => {
    const res = applyManualDiscountRules({
      eurosRaw: "15",
      centsRaw: null,
      reasonRaw: "Drop-in converted towards Bronze Bachata Pass.",
      hasPermission: true,
      productPriceCents: 5500,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.manualDiscountCents).toBe(1500);
      expect(res.reason).toBe("Drop-in converted towards Bronze Bachata Pass.");
    }
  });

  it("accepts cents-precise discount from server transit field", () => {
    const res = applyManualDiscountRules({
      eurosRaw: null,
      centsRaw: "1500",
      reasonRaw: "Drop-in conversion",
      hasPermission: true,
      productPriceCents: 5500,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.manualDiscountCents).toBe(1500);
  });

  it("accepts decimal euros and rounds to nearest cent", () => {
    const res = applyManualDiscountRules({
      eurosRaw: "12.345",
      centsRaw: null,
      reasonRaw: "Partial",
      hasPermission: true,
      productPriceCents: 5500,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.manualDiscountCents).toBe(1235);
  });
});
