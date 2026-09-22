import { describe, it, expect } from "vitest";
import type { MockSubscription } from "@/lib/mock-data";
import {
  getCreditSnapshot,
  usableRemainingCredits,
  isSubscriptionUsable,
  isWithinValidityWindow,
  isPastValidity,
  hasUnusedExpiredCredits,
  describeCreditBalance,
  statusPermitsBooking,
} from "@/lib/domain/credit-availability";

/** Silver-Pass-shaped credit pass: 8 credits, Term 5. */
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
    ...over,
  } as MockSubscription;
}

/** Membership: class-counted rather than credit-counted. */
function membership(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: "sub-gold",
    studentId: "s-1",
    productId: "p-gold",
    productName: "Gold Membership",
    productType: "membership",
    status: "active",
    totalCredits: null,
    remainingCredits: null,
    classesPerTerm: 12,
    classesUsed: 4,
    validFrom: "2026-07-20",
    validUntil: "2026-08-16",
    termId: "term-5",
    ...over,
  } as MockSubscription;
}

const DURING_TERM = "2026-08-01";
const LAST_DAY = "2026-08-16";
const AFTER_TERM = "2026-08-20";

// ── status gate ──────────────────────────────────────────────

describe("statusPermitsBooking", () => {
  it("only active permits booking", () => {
    expect(statusPermitsBooking("active")).toBe(true);
  });
  it.each(["paused", "expired", "exhausted", "cancelled"] as const)(
    "%s does not permit booking",
    (s) => {
      expect(statusPermitsBooking(s)).toBe(false);
    },
  );
});

// ── validity window ──────────────────────────────────────────

describe("validity window", () => {
  it("is inside the window mid-term", () => {
    expect(isWithinValidityWindow(pass(), DURING_TERM)).toBe(true);
  });

  it("validUntil is INCLUSIVE — still valid on the last day", () => {
    expect(isWithinValidityWindow(pass(), LAST_DAY)).toBe(true);
    expect(isPastValidity(pass(), LAST_DAY)).toBe(false);
  });

  it("is past validity the day after the term ends", () => {
    expect(isWithinValidityWindow(pass(), AFTER_TERM)).toBe(false);
    expect(isPastValidity(pass(), AFTER_TERM)).toBe(true);
  });

  it("is not yet valid before validFrom", () => {
    expect(isWithinValidityWindow(pass(), "2026-07-01")).toBe(false);
    // ...but that is "not started", not "expired".
    expect(isPastValidity(pass(), "2026-07-01")).toBe(false);
  });

  it("an open-ended entitlement (null validUntil) never passes validity", () => {
    expect(isPastValidity(pass({ validUntil: null }), "2099-01-01")).toBe(false);
  });
});

describe("isSubscriptionUsable", () => {
  it("active and in window → usable", () => {
    expect(isSubscriptionUsable(pass(), DURING_TERM)).toBe(true);
  });
  it("active but past validUntil → NOT usable, without waiting for lifecycle", () => {
    // This is the critical case: the row still reads `active` because
    // the nightly job has not run, but it must already be unusable.
    expect(isSubscriptionUsable(pass({ status: "active" }), AFTER_TERM)).toBe(false);
  });
  it("paused but in window → not usable", () => {
    expect(isSubscriptionUsable(pass({ status: "paused" }), DURING_TERM)).toBe(false);
  });
  it("expired status → not usable", () => {
    expect(isSubscriptionUsable(pass({ status: "expired" }), DURING_TERM)).toBe(false);
  });
});

// ── the headline scenario ────────────────────────────────────

describe("Silver Pass — 8 total, 3 used, term ends", () => {
  const silver = pass({ totalCredits: 8, remainingCredits: 5 });

  it("during the term: 5 usable", () => {
    const snap = getCreditSnapshot(silver, DURING_TERM);
    expect(snap.totalCredits).toBe(8);
    expect(snap.consumedCredits).toBe(3);
    expect(snap.historicalRemaining).toBe(5);
    expect(snap.usableRemaining).toBe(5);
    expect(snap.isUsable).toBe(true);
    expect(usableRemainingCredits(silver, DURING_TERM)).toBe(5);
  });

  it("after the term: 0 usable", () => {
    const snap = getCreditSnapshot(silver, AFTER_TERM);
    expect(snap.usableRemaining).toBe(0);
    expect(snap.isUsable).toBe(false);
    expect(snap.unusableReason).toBe("expired");
    expect(usableRemainingCredits(silver, AFTER_TERM)).toBe(0);
  });

  it("after the term: HISTORICAL counters are fully preserved", () => {
    const snap = getCreditSnapshot(silver, AFTER_TERM);
    expect(snap.totalCredits).toBe(8);
    expect(snap.consumedCredits).toBe(3);
    expect(snap.historicalRemaining).toBe(5);
    expect(snap.expiredOn).toBe("2026-08-16");
  });

  it("still usable on the final day of the term", () => {
    expect(usableRemainingCredits(silver, LAST_DAY)).toBe(5);
  });

  it("flags that unused credits were lost", () => {
    expect(hasUnusedExpiredCredits(silver, DURING_TERM)).toBe(false);
    expect(hasUnusedExpiredCredits(silver, AFTER_TERM)).toBe(true);
  });

  it("does NOT flag lost credits when the pass was fully used", () => {
    const usedUp = pass({ totalCredits: 8, remainingCredits: 0 });
    expect(hasUnusedExpiredCredits(usedUp, AFTER_TERM)).toBe(false);
  });
});

// ── memberships (class-count model) ─────────────────────────

describe("membership — class-count model", () => {
  it("reports classes used and remaining during the term", () => {
    const snap = getCreditSnapshot(membership(), DURING_TERM);
    expect(snap.model).toBe("class_count");
    expect(snap.totalCredits).toBe(12);
    expect(snap.consumedCredits).toBe(4);
    expect(snap.historicalRemaining).toBe(8);
    expect(snap.usableRemaining).toBe(8);
  });

  it("collapses to 0 usable after the term but keeps history", () => {
    const snap = getCreditSnapshot(membership(), AFTER_TERM);
    expect(snap.usableRemaining).toBe(0);
    expect(snap.consumedCredits).toBe(4);
    expect(snap.historicalRemaining).toBe(8);
    expect(snap.unusableReason).toBe("expired");
  });
});

// ── unlimited ────────────────────────────────────────────────

describe("unlimited entitlement", () => {
  const unlimited = membership({ classesPerTerm: null, classesUsed: 3 });

  it("has no cap while valid", () => {
    const snap = getCreditSnapshot(unlimited, DURING_TERM);
    expect(snap.model).toBe("unlimited");
    expect(snap.historicalRemaining).toBeNull();
    expect(snap.usableRemaining).toBeNull();
    expect(snap.isUsable).toBe(true);
  });

  it("becomes unusable after the term", () => {
    const snap = getCreditSnapshot(unlimited, AFTER_TERM);
    expect(snap.isUsable).toBe(false);
    expect(snap.usableRemaining).toBe(0);
  });
});

// ── exhausted vs expired ─────────────────────────────────────

describe("exhausted vs expired", () => {
  it("a fully-used pass inside its term reads as exhausted, not expired", () => {
    const snap = getCreditSnapshot(pass({ remainingCredits: 0 }), DURING_TERM);
    expect(snap.isUsable).toBe(false);
    expect(snap.unusableReason).toBe("exhausted");
    expect(snap.isPastValidity).toBe(false);
  });

  it("expiry takes precedence over exhaustion in the reason", () => {
    const snap = getCreditSnapshot(pass({ remainingCredits: 0 }), AFTER_TERM);
    expect(snap.unusableReason).toBe("expired");
  });
});

// ── spanTerms = 2 (Beginners 1 & 2 Promo Pass) ──────────────

describe("two-term product stays usable through its second term", () => {
  // Phase 14 sets validUntil to the NEXT consecutive term's endDate
  // for spanTerms >= 2. Term 1 ends 2026-04-26; Term 2 ends 2026-05-24.
  const beg12 = pass({
    id: "sub-beg12",
    productId: "p-beg12",
    productName: "Beginners 1 & 2 Promo Pass",
    totalCredits: 8,
    remainingCredits: 6,
    validFrom: "2026-03-30",
    validUntil: "2026-05-24",
    termId: "term-1",
  });

  it("usable during the FIRST term", () => {
    expect(usableRemainingCredits(beg12, "2026-04-10")).toBe(6);
  });

  it("STILL usable after the first term ends — this is the critical case", () => {
    // 2026-04-27 is the day after Term 1 ends. A single-term pass
    // would be dead here; this one must not be.
    expect(usableRemainingCredits(beg12, "2026-04-27")).toBe(6);
    expect(isSubscriptionUsable(beg12, "2026-04-27")).toBe(true);
  });

  it("usable through the SECOND term", () => {
    expect(usableRemainingCredits(beg12, "2026-05-20")).toBe(6);
  });

  it("usable on the last day of the second term", () => {
    expect(usableRemainingCredits(beg12, "2026-05-24")).toBe(6);
  });

  it("finally expires after the second term", () => {
    expect(usableRemainingCredits(beg12, "2026-05-25")).toBe(0);
    expect(getCreditSnapshot(beg12, "2026-05-25").historicalRemaining).toBe(6);
  });
});

// ── new-term entitlement is independent ─────────────────────

describe("term independence", () => {
  it("a new Term 6 pass is usable while the Term 5 pass is not", () => {
    const term5 = pass({ id: "sub-t5", validFrom: "2026-07-20", validUntil: "2026-08-16" });
    const term6 = pass({
      id: "sub-t6",
      validFrom: "2026-08-17",
      validUntil: "2026-09-13",
      remainingCredits: 8,
      termId: "term-6",
    });
    const dayInTerm6 = "2026-08-20";

    expect(usableRemainingCredits(term5, dayInTerm6)).toBe(0);
    expect(usableRemainingCredits(term6, dayInTerm6)).toBe(8);
  });

  it("credits never merge across terms — each is counted separately", () => {
    const term5 = pass({ id: "sub-t5", remainingCredits: 5 });
    const term6 = pass({
      id: "sub-t6",
      validFrom: "2026-08-17",
      validUntil: "2026-09-13",
      remainingCredits: 8,
    });
    const dayInTerm6 = "2026-08-20";
    const totalUsable =
      (usableRemainingCredits(term5, dayInTerm6) ?? 0) +
      (usableRemainingCredits(term6, dayInTerm6) ?? 0);
    // 8, not 13 — the 5 leftover from Term 5 do not carry forward.
    expect(totalUsable).toBe(8);
  });
});

// ── legacy rows ─────────────────────────────────────────────

describe("legacy rows", () => {
  it("handles a row with remainingCredits but no totalCredits", () => {
    const snap = getCreditSnapshot(
      pass({ totalCredits: null, remainingCredits: 3 }),
      DURING_TERM,
    );
    expect(snap.model).toBe("credits");
    expect(snap.historicalRemaining).toBe(3);
    // Consumed is unknowable without a total; report 0 rather than guess.
    expect(snap.consumedCredits).toBe(0);
  });

  it("treats a null validUntil as never expiring", () => {
    const openEnded = pass({ validUntil: null, remainingCredits: 2 });
    expect(usableRemainingCredits(openEnded, "2099-01-01")).toBe(2);
  });
});

// ── display copy ─────────────────────────────────────────────

describe("describeCreditBalance", () => {
  it("shows remaining for a usable pass", () => {
    expect(describeCreditBalance(pass(), DURING_TERM)).toBe(
      "3 of 8 credits used · 5 remaining",
    );
  });

  it("NEVER says 'remaining' for an expired pass with leftovers", () => {
    const label = describeCreditBalance(pass(), AFTER_TERM, "Term 5");
    expect(label).toBe("3 of 8 credits used · 5 unused credits expired at the end of Term 5");
    expect(label).not.toMatch(/\bremaining\b/);
  });

  it("falls back to the date when no term name is available", () => {
    const label = describeCreditBalance(pass({ termId: null }), AFTER_TERM);
    expect(label).toContain("expired on 2026-08-16");
    expect(label).not.toMatch(/\bremaining\b/);
  });

  it("omits the leftover clause when the pass was fully used", () => {
    const label = describeCreditBalance(
      pass({ remainingCredits: 0 }),
      AFTER_TERM,
      "Term 5",
    );
    expect(label).toBe("8 of 8 credits used");
  });

  it("uses 'classes' wording for memberships", () => {
    expect(describeCreditBalance(membership(), DURING_TERM)).toBe(
      "4 of 12 classes used · 8 remaining",
    );
  });

  it("describes expired membership classes without implying availability", () => {
    const label = describeCreditBalance(membership(), AFTER_TERM, "Term 5");
    expect(label).toBe("4 of 12 classes used · 8 unused classes expired at the end of Term 5");
    expect(label).not.toMatch(/\bremaining\b/);
  });

  it("marks a paused pass's leftovers as unused rather than remaining", () => {
    const label = describeCreditBalance(pass({ status: "paused" }), DURING_TERM);
    expect(label).toBe("3 of 8 credits used · 5 unused (paused)");
    expect(label).not.toMatch(/\bremaining\b/);
  });

  it("renders unlimited entitlements", () => {
    const unlimited = membership({ classesPerTerm: null });
    expect(describeCreditBalance(unlimited, DURING_TERM)).toBe("Unlimited");
    expect(describeCreditBalance(unlimited, AFTER_TERM)).toBe("Unlimited (ended)");
  });
});
