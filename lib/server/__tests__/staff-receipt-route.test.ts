/**
 * GET /api/receipts/staff/{subscription,event}/[id]: only staff holding
 * the exact `payments:send_receipt` permission (or Super Admin) get a PDF;
 * everyone else gets the same 404 as an unknown purchase.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { Permission } from "@/lib/domain/permissions";
import { EMPTY_RECEIPT_BUSINESS_SETTINGS } from "@/lib/domain/receipt-settings";

const h = vi.hoisted(() => ({
  user: null as AuthUser | null,
  access: null as null | { isSuperAdmin: boolean; permissions: Set<string> },
  subs: new Map<string, Record<string, unknown>>(),
  purchases: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
  readGate: null as null | Promise<void>,
}));

async function read(name: string) {
  h.reads.push(name);
  if (h.readGate) await h.readGate;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthUser: async () => h.user }));
vi.mock("@/lib/staff-permissions", () => ({
  getStaffAccess: async () => h.access,
  hasPermission: (access: { isSuperAdmin: boolean; permissions: Set<string> }, key: string) =>
    access.isSuperAdmin || access.permissions.has(key),
}));
vi.mock("@/lib/config/data-provider", () => ({ isMemoryMode: () => false }));
vi.mock("@/lib/supabase/academy", () => ({
  getAcademyName: async () => {
    await read("academy");
    return "Balance Power Motion";
  },
}));
vi.mock("@/lib/services/settings-store", () => ({
  hydrateSettings: async () => {
    await read("settings");
  },
  getReceiptBusinessSettings: () => ({ ...EMPTY_RECEIPT_BUSINESS_SETTINGS }),
}));
vi.mock("@/lib/repositories", () => ({
  getSubscriptionRepo: () => ({
    getById: async (id: string) => {
      await read("subscription");
      return h.subs.get(id) ?? null;
    },
  }),
  getSpecialEventRepo: () => ({ getPurchaseById: async (id: string) => h.purchases.get(id) ?? null }),
  getStudentRepo: () => ({
    getById: async (id: string) => (id === "student-1" ? { id, fullName: "Zaria Test", email: "zaria.test@example.com" } : null),
  }),
}));

import { handleStaffReceiptRequest } from "../staff-receipt-route";
import { ROLE_PRESETS } from "@/lib/domain/permissions";

const SUB = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const EVT_STUDENT = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const EVT_GUEST = "9d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const EVT_FREE = "ad7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const NOWHERE = "bd7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";

const staffUser: AuthUser = {
  id: "staff-1",
  email: "staff@example.test",
  fullName: "Staff",
  role: "admin",
  avatarUrl: null,
  academyId: "a",
  emailConfirmed: true,
};

function withPermissions(perms: readonly Permission[], isSuperAdmin = false) {
  h.user = staffUser;
  h.access = { isSuperAdmin, permissions: new Set(perms) };
}

function purchase(id: string, over: Record<string, unknown> = {}) {
  h.purchases.set(id, {
    id,
    eventId: "evt-1",
    studentId: "student-1",
    guestName: null,
    guestEmail: null,
    paymentStatus: "paid",
    paymentMethod: "stripe",
    receptionMethod: null,
    paidAt: "2026-10-05T18:00:00.000Z",
    purchasedAt: "2026-10-05T17:59:00.000Z",
    paidAmountCents: 9000,
    originalAmountCents: 9000,
    discountAmountCents: 0,
    currency: "eur",
    productNameSnapshot: "Full Pass",
    productTypeSnapshot: "full_pass",
    eventTitleSnapshot: "Salsa Weekender",
    paymentReference: null,
    refundedAt: null,
    refundedAmountCents: 0,
    refundStatus: null,
    stripeRefundId: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    vatPriceMode: null,
    totalIncVatCents: null,
    ...over,
  });
}

async function snapshot(res: Response) {
  return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
}

beforeEach(() => {
  h.subs.clear();
  h.purchases.clear();
  h.reads.length = 0;
  h.readGate = null;
  h.subs.set(SUB, {
    id: SUB,
    studentId: "student-1",
    paymentStatus: "paid",
    paymentMethod: "cash",
    paidAt: "2026-10-01T10:00:00.000Z",
    assignedAt: "2026-10-01T09:00:00.000Z",
    priceCentsAtPurchase: 5500,
    currencyAtPurchase: "EUR",
    originalPriceCents: 5500,
    discountAmountCents: 0,
    productNameSnapshot: "Bronze Class Pass",
    productTypeSnapshot: "pass",
    productName: "Bronze Class Pass",
    productType: "pass",
    paymentReference: null,
    refundedAt: null,
    refundedAmountCents: 0,
    refundStatus: null,
    stripeRefundId: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    vatPriceMode: null,
    totalIncVatCents: null,
  });
  purchase(EVT_STUDENT);
  purchase(EVT_GUEST, { studentId: null, guestName: "Guest Person", guestEmail: "guest@example.test" });
  purchase(EVT_FREE, { paidAmountCents: 0, originalAmountCents: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/receipts/staff/[kind]/[id]", () => {
  it("Admin preset (holds payments:send_receipt) gets subscription, student event and guest event receipts", async () => {
    expect(ROLE_PRESETS.admin).toContain("payments:send_receipt");
    withPermissions(ROLE_PRESETS.admin);
    for (const [kind, id] of [["subscription", SUB], ["event", EVT_STUDENT], ["event", EVT_GUEST]] as const) {
      const res = await handleStaffReceiptRequest(kind, id);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("Super Admin is allowed", async () => {
    withPermissions([], true);
    expect((await handleStaffReceiptRequest("event", EVT_GUEST)).status).toBe(200);
  });

  it("Teacher preset and staff without the exact key get the same 404 as an unknown purchase", async () => {
    expect(ROLE_PRESETS.teacher).not.toContain("payments:send_receipt");
    withPermissions(ROLE_PRESETS.teacher);
    const teacher = await snapshot(await handleStaffReceiptRequest("event", EVT_GUEST));
    withPermissions(["finance:view", "payments:refund", "events:mark_paid"]);
    const nearMiss = await snapshot(await handleStaffReceiptRequest("subscription", SUB));
    withPermissions(ROLE_PRESETS.admin);
    const unknown = await snapshot(await handleStaffReceiptRequest("event", NOWHERE));
    expect(teacher.status).toBe(404);
    expect(teacher).toEqual(unknown);
    expect(nearMiss).toEqual(unknown);
  });

  it("ineligible purchases, unknown kinds and malformed ids are 404", async () => {
    withPermissions(ROLE_PRESETS.admin);
    for (const [kind, id] of [["event", EVT_FREE], ["refund", SUB], ["subscription", EVT_STUDENT], ["event", "not-a-uuid"]]) {
      expect((await handleStaffReceiptRequest(kind, id)).status).toBe(404);
    }
  });

  it("starts the purchase, business settings and issuer reads together, loading settings once", async () => {
    withPermissions(ROLE_PRESETS.admin);
    let release!: () => void;
    h.readGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = handleStaffReceiptRequest("subscription", SUB);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...h.reads].sort()).toEqual(["academy", "settings", "subscription"]);

    release();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(h.reads.filter((r) => r === "settings")).toHaveLength(1);
  });

  it("reads no receipt data for staff without the permission", async () => {
    withPermissions(ROLE_PRESETS.teacher);
    expect((await handleStaffReceiptRequest("subscription", SUB)).status).toBe(404);
    expect(h.reads).toEqual([]);
  });

  it("requires a session", async () => {
    h.user = null;
    expect((await handleStaffReceiptRequest("event", EVT_GUEST)).status).toBe(401);
  });
});
