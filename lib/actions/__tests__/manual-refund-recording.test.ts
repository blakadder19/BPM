/**
 * Manual (non-Stripe) refunds are FULL-refund only: no path collects an
 * amount. Recording one must store the exact frozen amount paid, the date
 * and a confirmed status, so the receipt shows original total, refund and
 * net €0 — never a live product price and never a fabricated amount.
 * Drives the real actions and the real staff-access resolver.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";
import type { Permission } from "@/lib/domain/permissions";
import {
  buildReceiptData,
  evaluateReceiptEligibility,
  type EventPurchaseReceiptRow,
  type SubscriptionReceiptRow,
} from "@/lib/domain/receipts";
import { manualFullRefundFields } from "@/lib/domain/manual-refund";

const h = vi.hoisted(() => ({
  user: null as AuthUser | null,
  row: null as StaffMember | null,
  subs: new Map<string, Record<string, unknown>>(),
  purchases: [] as Record<string, unknown>[],
  updateSubscription: vi.fn(),
  refundPurchase: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    if (!h.user) throw new Error("REDIRECT:/login");
    return h.user;
  },
  requireRole: async () => h.user,
  getAuthUser: async () => h.user,
}));
// The live product price (9999) differs from every frozen amount so a
// fallback to it would be caught.
vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({ getStaff: async () => h.row }),
  getSubscriptionRepo: () => ({ getById: async (id: string) => h.subs.get(id) ?? null }),
  getStudentRepo: () => ({ getById: async (id: string) => ({ id, fullName: "Student" }) }),
  getProductRepo: () => ({ getById: async (id: string) => ({ id, name: "Live product", priceCents: 9999 }) }),
  getTermRepo: () => ({ getById: async () => null, getAll: async () => [] }),
  getSpecialEventRepo: () => ({
    getPurchasesByEvent: async () => h.purchases,
    getEventById: async () => ({ id: "evt-1", title: "Live title" }),
    updatePurchaseEmailTracking: vi.fn(async () => {}),
  }),
}));
vi.mock("@/lib/services/subscription-service", () => ({
  createSubscription: vi.fn(),
  updateSubscription: h.updateSubscription,
}));
vi.mock("@/lib/services/special-event-service", () => ({
  createPurchase: vi.fn(),
  updatePurchasePayment: vi.fn(),
  refundPurchase: h.refundPurchase,
}));
vi.mock("@/lib/communications/event-emails", () => ({
  sendEventPurchaseEmail: vi.fn(async () => ({ sent: true })),
  sendEventRefundEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock("@/lib/services/event-purchase-fulfillment", () => ({
  centsToEuros: (c: number) => `€${(c / 100).toFixed(2)}`,
  buildInclusionSummary: vi.fn(),
}));
vi.mock("@/lib/services/subscription-snapshot-service", () => ({ buildSnapshotFromProduct: vi.fn(async () => null) }));
vi.mock("@/lib/services/pricing-service", () => ({
  priceProductForStudent: vi.fn(),
  buildAuditDiscountMetadata: vi.fn(),
  releaseDiscountClaim: vi.fn(),
  attachClaimRelations: vi.fn(),
  resolveVatFor: vi.fn(() => ({ vatApplied: false })),
}));
vi.mock("@/lib/supabase/hydrate-operational", () => ({ ensureOperationalDataHydrated: vi.fn(async () => {}) }));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: vi.fn() }));
vi.mock("@/lib/communications/builders", () => ({
  paymentPendingEvent: vi.fn(),
  paymentConfirmedEvent: vi.fn(),
  subscriptionRefundedEvent: vi.fn(),
}));
vi.mock("@/lib/communications/dispatch", () => ({ dispatchCommEvents: vi.fn(async () => {}) }));
vi.mock("@/lib/communications/notification-store", () => ({
  dismissNotificationsForSubscription: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/booking-store", () => ({
  getBookingService: () => ({ bookings: [], refreshClasses: vi.fn() }),
}));
vi.mock("@/lib/utils/is-real-user", () => ({ isRealUser: () => true }));

const SUB_ID = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const EVT_PURCHASE_ID = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const REFUND_PERMS: Permission[] = ["students:edit", "students:view_finance", "finance:refund"];

function signIn(permissions: readonly Permission[]) {
  h.user = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Session Staff",
    role: "admin",
    avatarUrl: null,
    academyId: "a-1",
    emailConfirmed: true,
  };
  h.row = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Session Staff",
    legacyRole: "admin",
    roleKey: "custom",
    permissions: [...permissions],
    status: "active",
    invitedBy: null,
    updatedAt: null,
    createdAt: null,
  };
}

function subRow(over: Partial<SubscriptionReceiptRow> & Record<string, unknown> = {}) {
  const s = {
    id: SUB_ID,
    studentId: "s-1",
    status: "active",
    paymentStatus: "paid",
    paymentMethod: "cash",
    paidAt: "2026-10-01T10:00:00.000Z",
    assignedAt: "2026-10-01T09:00:00.000Z",
    priceCentsAtPurchase: 4500,
    currencyAtPurchase: "EUR",
    originalPriceCents: 5500,
    discountAmountCents: 1000,
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
    ...over,
  };
  h.subs.set(s.id, s);
  return s;
}

function eventRow(over: Partial<EventPurchaseReceiptRow> & Record<string, unknown> = {}) {
  const p = {
    id: EVT_PURCHASE_ID,
    eventId: "evt-1",
    studentId: null,
    guestName: "Guest Person",
    guestEmail: "guest@example.com",
    paymentStatus: "paid",
    paymentMethod: "manual",
    receptionMethod: "cash",
    paidAt: "2026-10-05T18:00:00.000Z",
    purchasedAt: "2026-10-05T17:59:00.000Z",
    paidAmountCents: 8000,
    originalAmountCents: 9000,
    discountAmountCents: 1000,
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
  h.purchases = [p];
  return p;
}

function lastSubPatch(): Record<string, unknown> {
  expect(h.updateSubscription).toHaveBeenCalledTimes(1);
  return h.updateSubscription.mock.calls[0][1];
}

function lastRefundPatch(): Record<string, unknown> {
  expect(h.refundPurchase).toHaveBeenCalledTimes(1);
  return h.refundPurchase.mock.calls[0][1];
}

async function applyChange(newPaymentStatus: string) {
  const { applyPaymentChangeAction } = await import("../subscriptions");
  return applyPaymentChangeAction({
    subscriptionId: SUB_ID,
    newPaymentStatus: newPaymentStatus as never,
    cancelEntitlement: false,
    refundReason: "Customer request",
  });
}

async function editStatus(paymentStatus: string) {
  const { updateSubscriptionAction } = await import("../subscriptions");
  const fd = new FormData();
  fd.set("id", SUB_ID);
  fd.set("status", "active");
  fd.set("paymentStatus", paymentStatus);
  return updateSubscriptionAction(fd);
}

async function refundEvent() {
  const { refundEventPurchaseAction } = await import("../event-purchase");
  return refundEventPurchaseAction({ purchaseId: EVT_PURCHASE_ID, eventId: "evt-1", refundReason: "Cancelled" });
}

beforeEach(() => {
  vi.resetModules();
  h.subs.clear();
  h.purchases = [];
  h.updateSubscription.mockReset();
  h.updateSubscription.mockResolvedValue({ success: true });
  h.refundPurchase.mockReset();
  h.refundPurchase.mockResolvedValue({ success: true });
  signIn(REFUND_PERMS);
});

describe("manualFullRefundFields", () => {
  it("records the frozen amount, the date and a confirmed status", () => {
    expect(manualFullRefundFields({ frozenPaidCents: 4500, refundedAtIso: "2026-11-17T10:00:00.000Z" })).toEqual({
      refundedAt: "2026-11-17T10:00:00.000Z",
      refundStatus: "succeeded",
      refundedAmountCents: 4500,
    });
  });

  it("records no amount when the frozen amount is missing, zero or malformed", () => {
    for (const frozenPaidCents of [null, undefined, 0, -100, 12.5]) {
      const fields = manualFullRefundFields({ frozenPaidCents, refundedAtIso: "2026-11-17T10:00:00.000Z" });
      expect(fields).not.toHaveProperty("refundedAmountCents");
    }
  });
});

describe("subscription manual refund — confirmation modal (applyPaymentChangeAction)", () => {
  it("records the frozen paid amount, never the product price or list price", async () => {
    subRow();
    const res = await applyChange("refunded");
    expect(res.success).toBe(true);
    const patch = lastSubPatch();
    expect(patch).toMatchObject({
      paymentStatus: "refunded",
      refundedAmountCents: 4500,
      refundStatus: "succeeded",
      refundedBy: "Session Staff",
      refundReason: "Customer request",
    });
    expect(typeof patch.refundedAt).toBe("string");
    expect(patch.refundedAmountCents).not.toBe(9999);
    expect(patch.refundedAmountCents).not.toBe(5500);
  });

  it("the resulting receipt is eligible: original total, full refund, net €0", async () => {
    const before = subRow();
    await applyChange("refunded");
    const row = { ...before, ...lastSubPatch() } as unknown as SubscriptionReceiptRow;
    const source = { kind: "subscription" as const, row, customer: { name: "Student", email: "s@example.com" } };
    expect(evaluateReceiptEligibility(source)).toEqual({ eligible: true });
    const built = buildReceiptData(source, { businessHasVatNumber: false });
    if (!built.ok) throw new Error(built.reason);
    expect(built.receipt.totalPaidCents).toBe(4500);
    expect(built.receipt.refund).toMatchObject({ refundedAmountCents: 4500, fullRefund: true });
    expect(built.receipt.netPaidCents).toBe(0);
  });

  it("a row without a frozen amount records the refund but no amount, and stays ineligible", async () => {
    const before = subRow({ priceCentsAtPurchase: null });
    await applyChange("refunded");
    const patch = lastSubPatch();
    expect(patch).toMatchObject({ paymentStatus: "refunded", refundStatus: "succeeded" });
    expect(patch).not.toHaveProperty("refundedAmountCents");
    const row = { ...before, ...patch } as unknown as SubscriptionReceiptRow;
    expect(evaluateReceiptEligibility({ kind: "subscription", row, customer: { name: "S", email: "s@x.ie" } }).eligible).toBe(false);
  });

  it("non-refund transitions write no refund fields", async () => {
    subRow({ paymentStatus: "pending" });
    signIn([...REFUND_PERMS, "payments:mark_paid_reception"]);
    await applyChange("paid");
    const patch = lastSubPatch();
    for (const k of ["refundedAt", "refundedAmountCents", "refundStatus", "refundedBy", "refundReason"]) {
      expect(patch).not.toHaveProperty(k);
    }
  });
});

describe("subscription manual refund — edit form (updateSubscriptionAction)", () => {
  it("records the same full-refund fields as the confirmation modal", async () => {
    subRow();
    const res = await editStatus("refunded");
    expect(res.success).toBe(true);
    const patch = lastSubPatch();
    expect(patch).toMatchObject({ paymentStatus: "refunded", refundedAmountCents: 4500, refundStatus: "succeeded" });
    expect(typeof patch.refundedAt).toBe("string");
  });

  it("moving a manual refund back to paid clears the refund so no stale amount reaches a receipt", async () => {
    subRow({
      paymentStatus: "refunded",
      refundedAt: "2026-11-01T10:00:00.000Z",
      refundedAmountCents: 4500,
      refundStatus: "succeeded",
    });
    signIn([...REFUND_PERMS, "payments:mark_paid_reception"]);
    const res = await editStatus("paid");
    expect(res.success).toBe(true);
    expect(lastSubPatch()).toMatchObject({
      paymentStatus: "paid",
      refundedAt: null,
      refundedAmountCents: 0,
      refundStatus: null,
    });
  });

  it("an unchanged status leaves historical refund data untouched", async () => {
    subRow({ paymentStatus: "refunded", refundedAt: null, refundedAmountCents: 0, refundStatus: null });
    const res = await editStatus("refunded");
    expect(res.success).toBe(true);
    const patch = lastSubPatch();
    for (const k of ["paymentStatus", "refundedAt", "refundedAmountCents", "refundStatus"]) {
      expect(patch).not.toHaveProperty(k);
    }
  });
});

describe("event purchase manual refund (refundEventPurchaseAction)", () => {
  it("records paidAmountCents, never originalAmountCents or the product price", async () => {
    eventRow();
    const res = await refundEvent();
    expect(res.success).toBe(true);
    const patch = lastRefundPatch();
    expect(patch).toMatchObject({ refundedAmountCents: 8000, refundStatus: "succeeded", fullRefund: true, refundedBy: "u-1" });
    expect(typeof patch.refundedAt).toBe("string");
  });

  it("the resulting receipt is eligible: original total, full refund, net €0", async () => {
    const before = eventRow();
    await refundEvent();
    const row = { ...before, ...lastRefundPatch(), paymentStatus: "refunded" } as unknown as EventPurchaseReceiptRow;
    const built = buildReceiptData({ kind: "event_purchase", row }, { businessHasVatNumber: false });
    if (!built.ok) throw new Error(built.reason);
    expect(built.receipt.totalPaidCents).toBe(8000);
    expect(built.receipt.refund).toMatchObject({ refundedAmountCents: 8000, fullRefund: true });
    expect(built.receipt.netPaidCents).toBe(0);
  });

  it("a purchase without a frozen paid amount records no refund amount", async () => {
    eventRow({ paidAmountCents: null });
    await refundEvent();
    expect(lastRefundPatch()).not.toHaveProperty("refundedAmountCents");
  });

  it("Stripe purchases are still refused on the manual path", async () => {
    eventRow({ paymentMethod: "stripe" });
    const res = await refundEvent();
    expect(res.success).toBe(false);
    expect(h.refundPurchase).not.toHaveBeenCalled();
  });
});
