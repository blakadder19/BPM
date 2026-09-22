/**
 * Phase 16 — booking-engine enforcement of end-of-term credit expiry.
 *
 * `credit-availability.test.ts` covers the pure arithmetic. This file
 * covers the thing that actually protects the business: that the
 * shared entitlement selector refuses an expired pass, so no booking
 * path can spend credits that should have lapsed.
 */
import { describe, it, expect } from "vitest";
import type { MockSubscription } from "@/lib/mock-data";
import type { ProductAccessRule } from "@/config/product-access";
import {
  isEntitlementValidForClass,
  getValidEntitlements,
  diagnoseNoEntitlement,
  toValidEntitlement,
  describeEntitlement,
  type ClassContext,
} from "@/lib/domain/entitlement-rules";
import { computeTermLifecycle, isSubscriptionExpired } from "@/lib/domain/term-lifecycle";
import type { MockTerm } from "@/lib/mock-data";

// Access rule that allows everything, so these tests isolate the
// expiry gate rather than style/level matching.
const OPEN_RULE: ProductAccessRule = {
  allowedClassTypes: ["class", "social", "student_practice"],
  styleAccess: { type: "all" },
  allowedLevels: null,
} as ProductAccessRule;

function pass(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: "sub-silver",
    studentId: "s-1",
    productId: "p-silver",
    productName: "Silver Class Pass",
    productType: "pass",
    status: "active",
    totalCredits: 8,
    remainingCredits: 5,
    classesPerTerm: null,
    classesUsed: 0,
    validFrom: "2026-07-20",
    validUntil: "2026-08-16",
    termId: "term-5",
    productSnapshot: null,
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    ...over,
  } as MockSubscription;
}

function cls(date: string): ClassContext {
  return {
    classType: "class",
    styleName: "Bachata",
    styleId: "ds-1",
    level: "Improvers",
    date,
  };
}

const rules = new Map<string, ProductAccessRule>([["p-silver", OPEN_RULE]]);

// Term 5: 2026-07-20 → 2026-08-16. Term 6: 2026-08-17 → 2026-09-13.
const DURING_T5 = "2026-08-01";
const LAST_DAY_T5 = "2026-08-16";
const DURING_T6 = "2026-08-25";

describe("isEntitlementValidForClass — expiry gate", () => {
  it("allows a current-term class during the term", () => {
    expect(
      isEntitlementValidForClass(pass(), cls(DURING_T5), [], OPEN_RULE, DURING_T5),
    ).toBe(true);
  });

  it("allows booking on the final day of the term", () => {
    expect(
      isEntitlementValidForClass(pass(), cls(LAST_DAY_T5), [], OPEN_RULE, LAST_DAY_T5),
    ).toBe(true);
  });

  it("refuses a NEXT-TERM class even while the pass is still in date", () => {
    // Class date is past validUntil — the pre-existing guard.
    expect(
      isEntitlementValidForClass(pass(), cls(DURING_T6), [], OPEN_RULE, DURING_T5),
    ).toBe(false);
  });

  it("refuses once TODAY is past validUntil, even for an in-window class date", () => {
    // Phase 16's new guard. The class fell inside the old window but
    // the entitlement has since lapsed, so it must not be spendable.
    expect(
      isEntitlementValidForClass(pass(), cls(DURING_T5), [], OPEN_RULE, DURING_T6),
    ).toBe(false);
  });

  it("refuses a row still marked 'active' whose term ended — no lifecycle dependency", () => {
    // The single most important case: enforcement must not wait for
    // the nightly job to flip the status.
    const stale = pass({ status: "active", validUntil: "2026-08-16" });
    expect(
      isEntitlementValidForClass(stale, cls(DURING_T6), [], OPEN_RULE, DURING_T6),
    ).toBe(false);
  });

  it("refuses an explicitly expired row", () => {
    expect(
      isEntitlementValidForClass(
        pass({ status: "expired" }),
        cls(DURING_T5),
        [],
        OPEN_RULE,
        DURING_T5,
      ),
    ).toBe(false);
  });

  it("refuses a paused row", () => {
    expect(
      isEntitlementValidForClass(
        pass({ status: "paused" }),
        cls(DURING_T5),
        [],
        OPEN_RULE,
        DURING_T5,
      ),
    ).toBe(false);
  });

  it("refuses when credits are exhausted", () => {
    expect(
      isEntitlementValidForClass(
        pass({ remainingCredits: 0 }),
        cls(DURING_T5),
        [],
        OPEN_RULE,
        DURING_T5,
      ),
    ).toBe(false);
  });
});

describe("getValidEntitlements — next-term booking", () => {
  it("an expired Term 5 pass is not offered for a Term 6 class", () => {
    const result = getValidEntitlements([pass()], cls(DURING_T6), [], rules, DURING_T6);
    expect(result).toHaveLength(0);
  });

  it("a new Term 6 pass IS offered for a Term 6 class", () => {
    const term6 = pass({
      id: "sub-t6",
      validFrom: "2026-08-17",
      validUntil: "2026-09-13",
      remainingCredits: 8,
      termId: "term-6",
    });
    const result = getValidEntitlements([term6], cls(DURING_T6), [], rules, DURING_T6);
    expect(result).toHaveLength(1);
    expect(result[0].subscriptionId).toBe("sub-t6");
  });

  it("with both passes held, only the new-term one is selectable", () => {
    const term6 = pass({
      id: "sub-t6",
      validFrom: "2026-08-17",
      validUntil: "2026-09-13",
      remainingCredits: 8,
      termId: "term-6",
    });
    const result = getValidEntitlements(
      [pass(), term6],
      cls(DURING_T6),
      [],
      rules,
      DURING_T6,
    );
    expect(result.map((r) => r.subscriptionId)).toEqual(["sub-t6"]);
  });

  it("reports USABLE credits on the returned entitlement, never stale leftovers", () => {
    const result = getValidEntitlements([pass()], cls(DURING_T5), [], rules, DURING_T5);
    expect(result[0].remainingCredits).toBe(5);
  });
});

describe("spanTerms = 2 product keeps its credits through the second term", () => {
  // Phase 14 gives a two-term product the SECOND term's endDate.
  const beg12 = pass({
    id: "sub-beg12",
    productId: "p-silver", // reuse the open rule
    productName: "Beginners 1 & 2 Promo Pass",
    remainingCredits: 6,
    validFrom: "2026-03-30",
    validUntil: "2026-05-24", // end of Term 2
    termId: "term-1",
  });

  it("is usable for a Term 1 class", () => {
    const r = getValidEntitlements([beg12], cls("2026-04-10"), [], rules, "2026-04-10");
    expect(r).toHaveLength(1);
  });

  it("does NOT expire when the first term ends — the critical regression guard", () => {
    // 2026-04-27 is the day after Term 1 ends.
    const r = getValidEntitlements([beg12], cls("2026-04-27"), [], rules, "2026-04-27");
    expect(r).toHaveLength(1);
    expect(r[0].remainingCredits).toBe(6);
  });

  it("is still usable late in the second term", () => {
    const r = getValidEntitlements([beg12], cls("2026-05-24"), [], rules, "2026-05-24");
    expect(r).toHaveLength(1);
  });

  it("finally expires after the second term ends", () => {
    const r = getValidEntitlements([beg12], cls("2026-05-25"), [], rules, "2026-05-25");
    expect(r).toHaveLength(0);
  });
});

describe("diagnoseNoEntitlement — expired-with-credits message", () => {
  it("explains that unused credits expired rather than giving a vague reason", () => {
    const msg = diagnoseNoEntitlement([pass()], cls(DURING_T6), rules, DURING_T6);
    expect(msg).toContain("Silver Class Pass");
    expect(msg).toContain("2026-08-16");
    expect(msg).toContain("5 unused credits expired");
    // Must not imply the credits are still available.
    expect(msg).not.toMatch(/\bremaining\b/);
  });

  it("does not use the expired-credits message when nothing was left over", () => {
    const msg = diagnoseNoEntitlement(
      [pass({ remainingCredits: 0 })],
      cls(DURING_T6),
      rules,
      DURING_T6,
    );
    expect(msg).not.toContain("unused credits expired");
  });
});

describe("entitlement display helpers report usable, not historical", () => {
  it("describeEntitlement shows 0 left for an expired pass", () => {
    expect(describeEntitlement(pass(), DURING_T6)).toBe("Silver Class Pass — 0 credits left");
  });

  it("describeEntitlement shows the real balance while valid", () => {
    expect(describeEntitlement(pass(), DURING_T5)).toBe("Silver Class Pass — 5 credits left");
  });

  it("toValidEntitlement zeroes remainingCredits once expired", () => {
    expect(toValidEntitlement(pass(), DURING_T6).remainingCredits).toBe(0);
    // ...but totalCredits is untouched, preserving history.
    expect(toValidEntitlement(pass(), DURING_T6).totalCredits).toBe(8);
  });
});

// ── Lifecycle ────────────────────────────────────────────────

const TERMS: MockTerm[] = [
  { id: "term-5", name: "Term 5", startDate: "2026-07-20", endDate: "2026-08-16", status: "active", notes: null },
  { id: "term-6", name: "Term 6", startDate: "2026-08-17", endDate: "2026-09-13", status: "upcoming", notes: null },
];

describe("lifecycle expiry is idempotent and non-destructive", () => {
  it("issues an expire instruction once the term has ended", () => {
    const instructions = computeTermLifecycle([pass()], TERMS, DURING_T6);
    const expires = instructions.filter((i) => i.type === "expire");
    expect(expires).toHaveLength(1);
    expect(expires[0].subscriptionId).toBe("sub-silver");
  });

  it("issues NOTHING on a second run once the row is already expired", () => {
    // Idempotency: after the first run flipped the status, re-running
    // must be a no-op rather than expiring it again.
    const alreadyExpired = pass({ status: "expired" });
    const instructions = computeTermLifecycle([alreadyExpired], TERMS, DURING_T6);
    expect(instructions.filter((i) => i.type === "expire")).toHaveLength(0);
  });

  it("does not expire on the final day of the term", () => {
    const instructions = computeTermLifecycle([pass()], TERMS, LAST_DAY_T5);
    expect(instructions.filter((i) => i.type === "expire")).toHaveLength(0);
  });

  it("does not expire a two-term product after its first term", () => {
    const beg12 = pass({ id: "sub-beg12", validUntil: "2026-05-24", termId: "term-1" });
    const instructions = computeTermLifecycle([beg12], TERMS, "2026-04-27");
    expect(instructions.filter((i) => i.type === "expire")).toHaveLength(0);
  });

  it("isSubscriptionExpired agrees with the booking-side boundary", () => {
    expect(isSubscriptionExpired(pass(), LAST_DAY_T5)).toBe(false);
    expect(isSubscriptionExpired(pass(), "2026-08-17")).toBe(true);
  });

  it("expiring a subscription never touches its credit counters", () => {
    // The lifecycle instruction carries only an id and a reason —
    // there is no credit mutation to accidentally apply.
    const instructions = computeTermLifecycle([pass()], TERMS, DURING_T6);
    const expire = instructions.find((i) => i.type === "expire");
    expect(expire).toBeDefined();
    expect(Object.keys(expire!)).toEqual(["type", "subscriptionId", "reason"]);
  });
});
