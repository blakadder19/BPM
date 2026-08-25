/**
 * Phase 14 — server-action tests for `extendSubscriptionAction`.
 *
 * The action combines four concerns that the pure-helper tests in
 * `lib/domain/__tests__/subscription-validity.test.ts` don't cover:
 *   1. permission gate (`payments:manual_adjustment`)
 *   2. subscription-status gate (only `active`/`paused` extendable)
 *   3. wiring of `updateSubscription` with the new expiry
 *   4. audit-log write via `logFinanceEvent`
 *
 * Follows the vi.mock scaffold used by
 * `lib/services/__tests__/pricing-service-*.test.ts`.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── Auth / permission mocks ─────────────────────────────────
const adminUser = { id: "admin-1", email: "admin@bpm.ie", fullName: "Admin One" };
let currentPermissionAllowed = true;

vi.mock("@/lib/staff-permissions", () => ({
  requirePermission: vi.fn(async () => {
    if (!currentPermissionAllowed) {
      throw new Error("Forbidden: missing permission");
    }
    return {
      user: adminUser,
      roleKey: "admin",
      status: "active",
      permissions: new Set(["payments:manual_adjustment"]),
      isSuperAdmin: false,
      isLegacyAdminFallback: false,
    };
  }),
  hasPermission: vi.fn(() => true),
  requirePermissionForAction: vi.fn(),
}));

// ── Finance-audit mock (spy) ────────────────────────────────
const auditCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/services/finance-audit-log", () => ({
  logFinanceEvent: vi.fn((entry: Record<string, unknown>) => {
    auditCalls.push(entry);
    return entry;
  }),
}));

// ── Subscription repo + service mocks ───────────────────────
type MockSub = {
  id: string;
  studentId: string;
  status: "active" | "paused" | "expired" | "cancelled" | "exhausted";
  validFrom: string;
  validUntil: string | null;
  productName: string;
};

let SUBS: MockSub[] = [];
const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];

vi.mock("@/lib/repositories", () => ({
  getSubscriptionRepo: () => ({
    async getById(id: string) {
      return SUBS.find((s) => s.id === id) ?? null;
    },
    async getAll() {
      return [...SUBS];
    },
  }),
  getProductRepo: () => ({ async getById() { return null; } }),
  getTermRepo: () => ({ async getById() { return null; }, async getAll() { return []; } }),
  getStudentRepo: () => ({ async getById() { return null; } }),
}));

vi.mock("@/lib/services/subscription-service", () => ({
  updateSubscription: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    updateCalls.push({ id, patch });
    const idx = SUBS.findIndex((s) => s.id === id);
    if (idx === -1) return { success: false, error: "not found" };
    SUBS[idx] = { ...SUBS[idx], ...patch } as MockSub;
    return { success: true };
  }),
  createSubscription: vi.fn(),
}));

// Silence noisy side-effect imports.
vi.mock("@/lib/supabase/hydrate-operational", () => ({
  ensureOperationalDataHydrated: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/booking-store", () => ({
  getBookingService: () => ({ bookings: [], getClass: () => null }),
}));
vi.mock("@/lib/services/pricing-service", () => ({
  priceProductForStudent: vi.fn(),
  buildAuditDiscountMetadata: vi.fn(() => null),
  releaseDiscountClaim: vi.fn(),
  attachClaimRelations: vi.fn(),
}));
vi.mock("@/lib/services/subscription-snapshot-service", () => ({
  buildSnapshotFromProduct: vi.fn(),
}));
vi.mock("@/lib/communications/builders", () => ({
  paymentPendingEvent: vi.fn(),
  paymentConfirmedEvent: vi.fn(),
  subscriptionRefundedEvent: vi.fn(),
}));
vi.mock("@/lib/communications/dispatch", () => ({
  dispatchCommEvents: vi.fn(async () => {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { extendSubscriptionAction } from "../subscriptions";

beforeEach(() => {
  SUBS = [];
  auditCalls.length = 0;
  updateCalls.length = 0;
  currentPermissionAllowed = true;
});

function seedSub(overrides: Partial<MockSub> = {}): MockSub {
  const sub: MockSub = {
    id: "sub-1",
    studentId: "stu-1",
    status: "active",
    validFrom: "2026-07-20",
    validUntil: "2026-08-16",
    productName: "Silver Class Pass",
    ...overrides,
  };
  SUBS.push(sub);
  return sub;
}

describe("extendSubscriptionAction", () => {
  it("extends validUntil, writes audit metadata, returns previous/new", async () => {
    seedSub();
    const res = await extendSubscriptionAction({
      subscriptionId: "sub-1",
      newValidUntil: "2026-09-13",
      reason: "Student hospitalised — missed 2 weeks",
    });
    expect(res.success).toBe(true);
    expect(res.previousValidUntil).toBe("2026-08-16");
    expect(res.newValidUntil).toBe("2026-09-13");

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe("sub-1");
    expect(updateCalls[0].patch).toEqual({ validUntil: "2026-09-13" });

    expect(auditCalls).toHaveLength(1);
    const entry = auditCalls[0];
    expect(entry.entityType).toBe("subscription");
    expect(entry.entityId).toBe("sub-1");
    expect(entry.action).toBe("manual_edit");
    expect(entry.previousValue).toBe("2026-08-16");
    expect(entry.newValue).toBe("2026-09-13");
    const meta = entry.metadata as { extension: Record<string, unknown> };
    expect(meta.extension.previousValidUntil).toBe("2026-08-16");
    expect(meta.extension.newValidUntil).toBe("2026-09-13");
    expect(meta.extension.reason).toBe("Student hospitalised — missed 2 weeks");
    expect(meta.extension.adminId).toBe("admin-1");
    expect(meta.extension.adminEmail).toBe("admin@bpm.ie");
    expect(typeof meta.extension.performedAt).toBe("string");
  });

  it("rejects when reason is empty", async () => {
    seedSub();
    const res = await extendSubscriptionAction({
      subscriptionId: "sub-1",
      newValidUntil: "2026-09-13",
      reason: "   ",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/reason/i);
    expect(updateCalls).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it("rejects same-day (no-op) extension", async () => {
    seedSub();
    const res = await extendSubscriptionAction({
      subscriptionId: "sub-1",
      newValidUntil: "2026-08-16",
      reason: "typo",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/after the current expiry/i);
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects backwards extension", async () => {
    seedSub();
    const res = await extendSubscriptionAction({
      subscriptionId: "sub-1",
      newValidUntil: "2026-08-01",
      reason: "shorten",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/after the current expiry/i);
  });

  it("rejects when subscription has no current expiry (open-ended)", async () => {
    seedSub({ validUntil: null });
    const res = await extendSubscriptionAction({
      subscriptionId: "sub-1",
      newValidUntil: "2026-12-31",
      reason: "extend",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no expiry/i);
  });

  it("rejects when subscription is expired (must renew, not extend)", async () => {
    seedSub({ status: "expired" });
    const res = await extendSubscriptionAction({
      subscriptionId: "sub-1",
      newValidUntil: "2026-09-13",
      reason: "extend",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/expired/i);
    expect(updateCalls).toHaveLength(0);
  });

  it("propagates the permission failure from requirePermission", async () => {
    seedSub();
    currentPermissionAllowed = false;
    await expect(
      extendSubscriptionAction({
        subscriptionId: "sub-1",
        newValidUntil: "2026-09-13",
        reason: "extend",
      }),
    ).rejects.toThrow(/permission/i);
    expect(updateCalls).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it("returns 'not found' when subscription id doesn't match", async () => {
    const res = await extendSubscriptionAction({
      subscriptionId: "missing",
      newValidUntil: "2026-09-13",
      reason: "extend",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found/i);
  });
});
