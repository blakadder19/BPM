/**
 * Phase 19 — credit consumption for backdated corrections.
 *
 * The behaviour under test is the `allowLapsedStatus` path added to
 * the shared consumption service. It exists because the nightly
 * lifecycle job flips a lapsed subscription to `expired`, and
 * refusing on that basis would block a correction for a class the
 * pass genuinely covered — making the outcome depend on whether cron
 * happened to run first.
 *
 * The date window and the balance check are still enforced, so the
 * relaxation cannot over-draw anyone.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockSubscription } from "@/lib/mock-data";

vi.mock("server-only", () => ({}));

let SUBS: MockSubscription[] = [];
const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

vi.mock("@/lib/repositories", () => ({
  getSubscriptionRepo: () => ({
    async getById(id: string) {
      return SUBS.find((s) => s.id === id) ?? null;
    },
  }),
}));

vi.mock("@/lib/services/subscription-service", () => ({
  updateSubscription: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    updates.push({ id, patch });
    const i = SUBS.findIndex((s) => s.id === id);
    if (i === -1) return { success: false };
    SUBS[i] = { ...SUBS[i], ...patch } as MockSubscription;
    return { success: true };
  }),
}));

import { consumeEntitlementCredit } from "../entitlement-consumption";

const CLASS_DATE = "2026-09-20";

function pass(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: "sub-1",
    studentId: "s-robin",
    productId: "p-silver",
    productName: "Silver Class Pass",
    productType: "pass",
    status: "active",
    totalCredits: 8,
    remainingCredits: 3,
    classesPerTerm: null,
    classesUsed: 0,
    validFrom: "2026-08-24",
    validUntil: "2026-09-21",
    ...over,
  } as MockSubscription;
}

function membership(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    ...pass(),
    id: "sub-mem",
    productType: "membership",
    productName: "Gold Membership",
    totalCredits: null,
    remainingCredits: null,
    classesPerTerm: 12,
    classesUsed: 4,
    ...over,
  } as MockSubscription;
}

beforeEach(() => {
  SUBS = [];
  updates.length = 0;
});

describe("backdated consumption — lapsed status", () => {
  it("ALLOWS an 'expired' row whose window covered the class date", () => {
    SUBS = [pass({ status: "expired" })];
    return consumeEntitlementCredit("sub-1", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    }).then((r) => {
      expect(r.consumed).toBe(true);
      expect(updates[0].patch).toEqual({ remainingCredits: 2 });
    });
  });

  it("REFUSES the same row without the flag (normal booking path)", async () => {
    SUBS = [pass({ status: "expired" })];
    const r = await consumeEntitlementCredit("sub-1", "booking", CLASS_DATE);
    expect(r.consumed).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("still refuses a date OUTSIDE the window even with the flag", async () => {
    SUBS = [pass({ status: "expired", validUntil: "2026-09-19" })];
    const r = await consumeEntitlementCredit("sub-1", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(r.consumed).toBe(false);
    expect(r.reason).toBe("expired");
    expect(updates).toHaveLength(0);
  });

  it("still refuses a deliberately withdrawn row (cancelled)", async () => {
    SUBS = [pass({ status: "cancelled" })];
    const r = await consumeEntitlementCredit("sub-1", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(r.consumed).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("still refuses a paused row", async () => {
    SUBS = [pass({ status: "paused" })];
    const r = await consumeEntitlementCredit("sub-1", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(r.consumed).toBe(false);
  });

  it("still refuses when no credits remain", async () => {
    SUBS = [pass({ status: "expired", remainingCredits: 0 })];
    const r = await consumeEntitlementCredit("sub-1", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(r.consumed).toBe(false);
    expect(r.reason).toBe("exhausted");
    expect(updates).toHaveLength(0);
  });
});

describe("backdated consumption — credit models", () => {
  it("decrements remainingCredits for a pass", async () => {
    SUBS = [pass({ remainingCredits: 3 })];
    await consumeEntitlementCredit("sub-1", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(SUBS[0].remainingCredits).toBe(2);
  });

  it("increments classesUsed for a metered membership", async () => {
    SUBS = [membership({ classesUsed: 4, classesPerTerm: 12 })];
    await consumeEntitlementCredit("sub-mem", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(SUBS[0].classesUsed).toBe(5);
    expect(updates[0].patch).toEqual({ classesUsed: 5 });
  });

  it("refuses a membership that already used its full allowance", async () => {
    SUBS = [membership({ classesUsed: 12, classesPerTerm: 12 })];
    const r = await consumeEntitlementCredit("sub-mem", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(r.consumed).toBe(false);
    expect(r.reason).toBe("exhausted");
  });

  it("makes NO finite decrement for an unlimited membership", async () => {
    SUBS = [membership({ classesPerTerm: null, classesUsed: 7 })];
    const r = await consumeEntitlementCredit("sub-mem", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(r.consumed).toBe(true);
    // Only the usage counter moves; there is no balance to draw down.
    expect(SUBS[0].classesUsed).toBe(8);
    expect(SUBS[0].remainingCredits).toBeNull();
  });
});

describe("backdated consumption — guard rails", () => {
  it("consumes exactly ONE unit per call", async () => {
    SUBS = [pass({ remainingCredits: 5 })];
    await consumeEntitlementCredit("sub-1", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(SUBS[0].remainingCredits).toBe(4);
    expect(updates).toHaveLength(1);
  });

  it("returns not_found for an unknown subscription", async () => {
    const r = await consumeEntitlementCredit("nope", "attendance_backdate", CLASS_DATE, {
      allowLapsedStatus: true,
    });
    expect(r.consumed).toBe(false);
    expect(r.reason).toBe("not_found");
  });

  it("evaluates the window against the CLASS date, not today", async () => {
    // Window ends 2026-09-21. A correction dated inside it succeeds…
    SUBS = [pass({ status: "expired" })];
    const ok = await consumeEntitlementCredit("sub-1", "attendance_backdate", "2026-09-21", {
      allowLapsedStatus: true,
    });
    expect(ok.consumed).toBe(true);

    // …and one dated after it does not.
    SUBS = [pass({ status: "expired" })];
    const no = await consumeEntitlementCredit("sub-1", "attendance_backdate", "2026-09-22", {
      allowLapsedStatus: true,
    });
    expect(no.consumed).toBe(false);
  });
});
