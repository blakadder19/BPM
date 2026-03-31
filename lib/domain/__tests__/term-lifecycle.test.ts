import { describe, it, expect } from "vitest";
import {
  computeTermLifecycle,
  isSubscriptionExpired,
  daysUntilExpiry,
  isRenewalEligible,
  findRenewalSuccessor,
} from "@/lib/domain/term-lifecycle";
import type { MockSubscription, MockTerm } from "@/lib/mock-data";

function makeTerm(overrides: Partial<MockTerm> = {}): MockTerm {
  return {
    id: "term-1",
    name: "Spring 2026",
    startDate: "2026-03-01",
    endDate: "2026-05-31",
    status: "active",
    weeks: [],
    ...overrides,
  } as MockTerm;
}

function makeSub(overrides: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: "sub-1",
    studentId: "s-1",
    productId: "prod-1",
    productName: "Gold Membership",
    productType: "membership",
    status: "active",
    totalCredits: null,
    remainingCredits: null,
    validFrom: "2026-03-01",
    validUntil: "2026-05-31",
    notes: null,
    termId: "term-1",
    paymentMethod: "cash",
    paymentStatus: "paid",
    autoRenew: true,
    classesUsed: 2,
    classesPerTerm: 12,
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    renewedFromId: null,
    assignedBy: null,
    assignedAt: null,
    paidAt: null,
    paymentReference: null,
    paymentNotes: null,
    collectedBy: null,
    ...overrides,
  } as MockSubscription;
}

const TERM_1 = makeTerm({ id: "term-1", startDate: "2026-03-01", endDate: "2026-05-31" });
const TERM_2 = makeTerm({ id: "term-2", name: "Summer 2026", startDate: "2026-06-01", endDate: "2026-08-31" });
const TERMS = [TERM_1, TERM_2];

describe("computeTermLifecycle — expiry", () => {
  it("expires active subscriptions past validUntil", () => {
    const sub = makeSub({ validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-01");
    const expiry = result.find((i) => i.type === "expire");
    expect(expiry).toBeDefined();
    expect(expiry!.subscriptionId).toBe("sub-1");
  });

  it("does NOT expire active subscriptions before validUntil", () => {
    const sub = makeSub({ validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-05-30");
    const expiry = result.find((i) => i.type === "expire");
    expect(expiry).toBeUndefined();
  });

  it("does NOT expire already-expired subscriptions", () => {
    const sub = makeSub({ status: "expired", validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-01");
    const expiry = result.find((i) => i.type === "expire");
    expect(expiry).toBeUndefined();
  });

  it("does NOT expire subscriptions with no validUntil", () => {
    const sub = makeSub({ validUntil: null });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-01");
    const expiry = result.find((i) => i.type === "expire");
    expect(expiry).toBeUndefined();
  });

  it("sets reason=term_ended when subscription has a termId", () => {
    const sub = makeSub({ termId: "term-1", validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-01");
    const expiry = result.find((i) => i.type === "expire");
    expect(expiry).toBeDefined();
    if (expiry?.type === "expire") {
      expect(expiry.reason).toBe("term_ended");
    }
  });

  it("sets reason=validity_passed when subscription has no termId", () => {
    const sub = makeSub({ termId: null, validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-01");
    const expiry = result.find((i) => i.type === "expire");
    expect(expiry).toBeDefined();
    if (expiry?.type === "expire") {
      expect(expiry.reason).toBe("validity_passed");
    }
  });
});

describe("computeTermLifecycle — renewal preparation", () => {
  it("prepares renewal when within 7-day window before expiry", () => {
    const sub = makeSub({ autoRenew: true, termId: "term-1", validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-05-25");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeDefined();
    if (renewal?.type === "prepare_renewal") {
      expect(renewal.nextTerm.id).toBe("term-2");
    }
  });

  it("does NOT prepare renewal for non-membership products", () => {
    const sub = makeSub({ productType: "pass", autoRenew: false, termId: "term-1", validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-05-25");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });

  it("does NOT prepare renewal when autoRenew is false", () => {
    const sub = makeSub({ autoRenew: false, termId: "term-1", validUntil: "2026-05-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-05-25");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });

  it("does NOT prepare renewal when no next term exists", () => {
    const sub = makeSub({ autoRenew: true, termId: "term-2", validUntil: "2026-08-31" });
    const result = computeTermLifecycle([sub], TERMS, "2026-08-25");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });

  it("does NOT prepare duplicate renewal when one already exists", () => {
    const source = makeSub({ id: "sub-1", autoRenew: true, termId: "term-1", validUntil: "2026-05-31" });
    const existing = makeSub({
      id: "sub-2",
      renewedFromId: "sub-1",
      termId: "term-2",
      validFrom: "2026-06-01",
      validUntil: "2026-08-31",
    });
    const result = computeTermLifecycle([source, existing], TERMS, "2026-05-25");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });

  it("does NOT prepare duplicate when same product+term exists for student", () => {
    const source = makeSub({ id: "sub-1", autoRenew: true, termId: "term-1", validUntil: "2026-05-31" });
    const blocking = makeSub({
      id: "sub-3",
      renewedFromId: null,
      termId: "term-2",
      productId: "prod-1",
      validFrom: "2026-06-01",
      validUntil: "2026-08-31",
    });
    const result = computeTermLifecycle([source, blocking], TERMS, "2026-05-25");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });
});

describe("computeTermLifecycle — missed renewal catchup", () => {
  it("prepares renewal for already-expired auto-renew membership if next term still valid", () => {
    const sub = makeSub({
      status: "expired",
      autoRenew: true,
      termId: "term-1",
      validUntil: "2026-05-31",
    });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-05");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeDefined();
    if (renewal?.type === "prepare_renewal") {
      expect(renewal.nextTerm.id).toBe("term-2");
    }
  });

  it("does NOT catch up if next term has also ended", () => {
    const sub = makeSub({
      status: "expired",
      autoRenew: true,
      termId: "term-1",
      validUntil: "2026-05-31",
    });
    const result = computeTermLifecycle([sub], TERMS, "2026-09-15");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });

  it("does NOT catch up for non-auto-renew", () => {
    const sub = makeSub({
      status: "expired",
      autoRenew: false,
      termId: "term-1",
      validUntil: "2026-05-31",
    });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-05");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });

  it("does NOT catch up for passes", () => {
    const sub = makeSub({
      status: "expired",
      productType: "pass",
      autoRenew: true,
      termId: "term-1",
      validUntil: "2026-05-31",
    });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-05");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(renewal).toBeUndefined();
  });

  it("also prepares renewal at expiry time (same lifecycle run)", () => {
    const sub = makeSub({
      status: "active",
      autoRenew: true,
      termId: "term-1",
      validUntil: "2026-05-31",
    });
    const result = computeTermLifecycle([sub], TERMS, "2026-06-01");
    const expiry = result.find((i) => i.type === "expire");
    const renewal = result.find((i) => i.type === "prepare_renewal");
    expect(expiry).toBeDefined();
    expect(renewal).toBeDefined();
  });
});

describe("isSubscriptionExpired", () => {
  it("returns true for active sub past validUntil", () => {
    const sub = makeSub({ status: "active", validUntil: "2026-05-31" });
    expect(isSubscriptionExpired(sub, "2026-06-01")).toBe(true);
  });

  it("returns false for active sub before validUntil", () => {
    const sub = makeSub({ status: "active", validUntil: "2026-05-31" });
    expect(isSubscriptionExpired(sub, "2026-05-30")).toBe(false);
  });

  it("returns false for already-expired sub", () => {
    const sub = makeSub({ status: "expired", validUntil: "2026-05-31" });
    expect(isSubscriptionExpired(sub, "2026-06-01")).toBe(false);
  });

  it("returns false for sub with no validUntil", () => {
    const sub = makeSub({ status: "active", validUntil: null });
    expect(isSubscriptionExpired(sub, "2026-06-01")).toBe(false);
  });
});

describe("daysUntilExpiry", () => {
  it("returns positive for future expiry", () => {
    const sub = makeSub({ validUntil: "2026-06-01" });
    expect(daysUntilExpiry(sub, "2026-05-30")).toBe(2);
  });

  it("returns 0 on expiry day", () => {
    const sub = makeSub({ validUntil: "2026-06-01" });
    expect(daysUntilExpiry(sub, "2026-06-01")).toBe(0);
  });

  it("returns negative for past expiry", () => {
    const sub = makeSub({ validUntil: "2026-05-31" });
    expect(daysUntilExpiry(sub, "2026-06-02")).toBe(-2);
  });

  it("returns null for open-ended sub", () => {
    const sub = makeSub({ validUntil: null });
    expect(daysUntilExpiry(sub, "2026-06-01")).toBeNull();
  });
});

describe("isRenewalEligible", () => {
  it("returns true for active auto-renew membership with next term", () => {
    const sub = makeSub({ status: "active", autoRenew: true, termId: "term-1" });
    expect(isRenewalEligible(sub, [sub], TERMS)).toBe(true);
  });

  it("returns true for expired membership with next term", () => {
    const sub = makeSub({ status: "expired", autoRenew: true, termId: "term-1" });
    expect(isRenewalEligible(sub, [sub], TERMS)).toBe(true);
  });

  it("returns false for pass", () => {
    const sub = makeSub({ productType: "pass", autoRenew: false, termId: "term-1" });
    expect(isRenewalEligible(sub, [sub], TERMS)).toBe(false);
  });

  it("returns false when no next term", () => {
    const sub = makeSub({ autoRenew: true, termId: "term-2" });
    expect(isRenewalEligible(sub, [sub], TERMS)).toBe(false);
  });

  it("returns false when renewal already exists", () => {
    const source = makeSub({ id: "sub-1", autoRenew: true, termId: "term-1" });
    const renewal = makeSub({ id: "sub-2", renewedFromId: "sub-1", termId: "term-2" });
    expect(isRenewalEligible(source, [source, renewal], TERMS)).toBe(false);
  });

  it("returns false for cancelled status", () => {
    const sub = makeSub({ status: "cancelled", autoRenew: true, termId: "term-1" });
    expect(isRenewalEligible(sub, [sub], TERMS)).toBe(false);
  });
});

describe("findRenewalSuccessor", () => {
  it("returns the renewal subscription", () => {
    const source = makeSub({ id: "sub-1" });
    const renewal = makeSub({ id: "sub-2", renewedFromId: "sub-1" });
    expect(findRenewalSuccessor("sub-1", [source, renewal])?.id).toBe("sub-2");
  });

  it("returns null when no successor exists", () => {
    const source = makeSub({ id: "sub-1" });
    expect(findRenewalSuccessor("sub-1", [source])).toBeNull();
  });
});
