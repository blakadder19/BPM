/**
 * Student receipt downloads: only the signed-in student's own eligible
 * purchases produce a PDF, and every other case (someone else's purchase,
 * unknown id, ineligible, guest purchase, malformed id, internal error)
 * gets the identical 404. Uses the real handler, ownership/eligibility
 * service and PDF renderer; auth, repositories and settings are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import { EMPTY_RECEIPT_BUSINESS_SETTINGS } from "@/lib/domain/receipt-settings";

const h = vi.hoisted(() => ({
  user: null as AuthUser | null,
  subs: new Map<string, Record<string, unknown>>(),
  purchases: new Map<string, Record<string, unknown>>(),
  events: new Map<string, { id: string; title: string }>(),
  getByStudent: vi.fn(),
  getPurchasesByStudent: vi.fn(),
  getAll: vi.fn(),
  throwOnLookup: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAuthUser: async () => h.user }));
vi.mock("@/lib/config/data-provider", () => ({ isMemoryMode: () => false }));
vi.mock("@/lib/supabase/academy", () => ({ getAcademyName: async () => "Balance Power Motion" }));
vi.mock("@/lib/services/settings-store", () => ({
  hydrateSettings: async () => {},
  getReceiptBusinessSettings: () => ({ ...EMPTY_RECEIPT_BUSINESS_SETTINGS }),
}));
vi.mock("@/lib/repositories", () => ({
  getSubscriptionRepo: () => ({
    getById: async (id: string) => {
      if (h.throwOnLookup) throw new Error("db down");
      return h.subs.get(id) ?? null;
    },
    getByStudent: h.getByStudent,
    getAll: h.getAll,
  }),
  getSpecialEventRepo: () => ({
    getPurchaseById: async (id: string) => h.purchases.get(id) ?? null,
    getPurchasesByStudent: h.getPurchasesByStudent,
    getEventById: async (id: string) => h.events.get(id) ?? null,
    getAllPurchases: h.getAll,
  }),
}));

import { handleStudentReceiptRequest } from "../student-receipt-route";
import { listStudentPaymentHistory } from "@/lib/services/student-receipts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SUB_MINE = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const SUB_OTHER = "4f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const SUB_PENDING = "5f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const SUB_COMP = "6f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const EVT_MINE = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const EVT_GUEST = "9d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const EVT_FREE = "ad7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const NOWHERE = "bd7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";

function student(id = ME): AuthUser {
  return { id, email: "zaria.test@example.com", fullName: "Zaria Test", role: "student", avatarUrl: null, academyId: "a", emailConfirmed: true };
}

function sub(id: string, over: Record<string, unknown> = {}) {
  const row = {
    id,
    studentId: ME,
    paymentStatus: "paid",
    paymentMethod: "stripe",
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
    paymentReference: "stripe:cs_live_x",
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
  };
  h.subs.set(id, row);
  return row;
}

function purchase(id: string, over: Record<string, unknown> = {}) {
  const row = {
    id,
    eventId: "evt-1",
    studentId: ME,
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
    productNameSnapshot: "Beginners Course",
    productTypeSnapshot: "full_pass",
    eventTitleSnapshot: "Beginners Salsa & Bachata",
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
  };
  h.purchases.set(id, row);
  return row;
}

async function snapshot(res: Response) {
  return {
    status: res.status,
    body: await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
  };
}

beforeEach(() => {
  h.user = student();
  h.subs.clear();
  h.purchases.clear();
  h.events.clear();
  h.throwOnLookup = false;
  h.getAll.mockReset();
  h.getByStudent.mockReset();
  h.getByStudent.mockImplementation(async (id: string) => [...h.subs.values()].filter((s) => s.studentId === id));
  h.getPurchasesByStudent.mockReset();
  h.getPurchasesByStudent.mockImplementation(async (id: string) => [...h.purchases.values()].filter((p) => p.studentId === id));
  sub(SUB_MINE);
  sub(SUB_OTHER, { studentId: OTHER });
  sub(SUB_PENDING, { paymentStatus: "pending", paidAt: null, assignedAt: "2026-11-10T09:00:00.000Z" });
  sub(SUB_COMP, { paymentStatus: "complimentary", paymentMethod: "complimentary", priceCentsAtPurchase: 0, paidAt: null, assignedAt: "2026-09-01T09:00:00.000Z" });
  purchase(EVT_MINE);
  purchase(EVT_GUEST, { studentId: null, guestName: "Guest", guestEmail: "guest@example.com" });
  purchase(EVT_FREE, { paidAmountCents: 0, originalAmountCents: 0, paidAt: "2026-08-01T10:00:00.000Z" });
});

describe("GET /api/receipts/{subscription,event}/[id]", () => {
  it("returns the owner's eligible subscription receipt as a private PDF download", async () => {
    const res = await handleStudentReceiptRequest("subscription", SUB_MINE);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="BPM-Payment-Receipt-BPM-S-[0-9A-Z-]+\.pdf"$/);
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("returns the owner's eligible event receipt", async () => {
    const res = await handleStudentReceiptRequest("event_purchase", EVT_MINE);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("BPM-Payment-Receipt-BPM-E-");
  });

  it("gives the identical 404 for another student's purchase, an unknown id and an ineligible purchase", async () => {
    const cases = await Promise.all([
      handleStudentReceiptRequest("subscription", SUB_OTHER),
      handleStudentReceiptRequest("subscription", NOWHERE),
      handleStudentReceiptRequest("subscription", SUB_PENDING),
      handleStudentReceiptRequest("subscription", SUB_COMP),
      handleStudentReceiptRequest("event_purchase", EVT_GUEST),
      handleStudentReceiptRequest("event_purchase", EVT_FREE),
      handleStudentReceiptRequest("event_purchase", SUB_MINE),
      handleStudentReceiptRequest("subscription", "not-a-uuid"),
    ]);
    const snaps = await Promise.all(cases.map(snapshot));
    for (const s of snaps) {
      expect(s.status).toBe(404);
      expect(s).toEqual(snaps[0]);
    }
    expect(snaps[0].headers["cache-control"]).toContain("no-store");
    expect(snaps[0].headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("an internal error is indistinguishable from not found", async () => {
    h.throwOnLookup = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await snapshot(await handleStudentReceiptRequest("subscription", SUB_MINE));
    h.throwOnLookup = false;
    const missing = await snapshot(await handleStudentReceiptRequest("subscription", NOWHERE));
    expect(err).toEqual(missing);
  });

  it("staff accounts get 404 even for a real student's purchase", async () => {
    h.user = { ...student(), role: "admin" };
    expect((await handleStudentReceiptRequest("subscription", SUB_MINE)).status).toBe(404);
  });

  it("requires a session", async () => {
    h.user = null;
    const res = await handleStudentReceiptRequest("subscription", SUB_MINE);
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("a refunded receipt reflects only the confirmed refund", async () => {
    sub(SUB_MINE, {
      paymentStatus: "refunded",
      refundedAt: "2026-11-02T15:00:00.000Z",
      refundedAmountCents: 5500,
      refundStatus: "succeeded",
    });
    expect((await handleStudentReceiptRequest("subscription", SUB_MINE)).status).toBe(200);
    sub(SUB_MINE, { paymentStatus: "refunded", refundedAt: null, refundedAmountCents: 0, refundStatus: null });
    expect((await handleStudentReceiptRequest("subscription", SUB_MINE)).status).toBe(404);
  });
});

describe("listStudentPaymentHistory", () => {
  it("queries only the signed-in student's rows, never everyone's", async () => {
    await listStudentPaymentHistory(student());
    expect(h.getByStudent).toHaveBeenCalledWith(ME);
    expect(h.getPurchasesByStudent).toHaveBeenCalledWith(ME);
    expect(h.getAll).not.toHaveBeenCalled();
  });

  it("lists subscriptions and event purchases newest first, without other students' or guests' rows", async () => {
    const items = await listStudentPaymentHistory(student());
    expect(items.map((i) => i.id)).toEqual([SUB_PENDING, EVT_MINE, SUB_MINE, SUB_COMP, EVT_FREE]);
  });

  it("offers a receipt exactly where the receipt route would serve one", async () => {
    const items = await listStudentPaymentHistory(student());
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(SUB_MINE)?.receipt).toEqual({ kind: "download", href: `/api/receipts/subscription/${SUB_MINE}` });
    expect(byId.get(EVT_MINE)?.receipt).toEqual({ kind: "download", href: `/api/receipts/event/${EVT_MINE}` });
    expect(byId.get(SUB_PENDING)?.receipt).toEqual({ kind: "awaiting_payment" });
    expect(byId.get(SUB_COMP)?.receipt).toEqual({ kind: "no_payment", label: "Complimentary — no payment taken" });
    expect(byId.get(EVT_FREE)?.receipt).toEqual({ kind: "no_payment", label: "Free registration" });
    for (const item of items) {
      const res = await handleStudentReceiptRequest(item.sourceType, item.id);
      expect(res.status).toBe(item.receipt.kind === "download" ? 200 : 404);
    }
  });

  it("shows the frozen amounts, event title and refund state", async () => {
    sub(SUB_MINE, {
      paymentStatus: "refunded",
      refundedAt: "2026-11-02T15:00:00.000Z",
      refundedAmountCents: 5500,
      refundStatus: "succeeded",
    });
    const items = await listStudentPaymentHistory(student());
    const mine = items.find((i) => i.id === SUB_MINE)!;
    expect(mine).toMatchObject({ amountCents: 5500, currency: "EUR", paymentStatusLabel: "Refunded", refundLabel: "Refunded", typeLabel: "Pass" });
    const evt = items.find((i) => i.id === EVT_MINE)!;
    expect(evt).toMatchObject({ itemName: "Beginners Course", secondaryLabel: "Beginners Salsa & Bachata", amountCents: 9000 });
  });

  it("pre-00082 event rows show the live title in the list but get no receipt", async () => {
    purchase(EVT_MINE, { eventTitleSnapshot: undefined });
    h.events.set("evt-1", { id: "evt-1", title: "Live Title" });
    const items = await listStudentPaymentHistory(student());
    const evt = items.find((i) => i.id === EVT_MINE)!;
    expect(evt.secondaryLabel).toBe("Live Title");
    expect(evt.receipt).toEqual({ kind: "unavailable" });
  });

  it("staff accounts get an empty list", async () => {
    expect(await listStudentPaymentHistory({ ...student(), role: "teacher" })).toEqual([]);
    expect(h.getByStudent).not.toHaveBeenCalled();
  });
});
