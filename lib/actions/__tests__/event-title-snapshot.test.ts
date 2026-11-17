/**
 * Phase 23A.1 — every event purchase creation path freezes the event title
 * from the event record at insert time, and renaming the event afterwards
 * never changes the receipt built from the purchase.
 *
 * Drives the five real creation paths and the real special-event service;
 * only auth, pricing, email and the repository boundary are mocked.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildReceiptData } from "@/lib/domain/receipts";
import type { MockEventPurchase } from "@/lib/mock-data";

const EVENT_ID = "evt-1";
const PRODUCT_ID = "prod-1";
const ORIGINAL_TITLE = "Beginners Salsa & Bachata";

const h = vi.hoisted(() => ({
  events: new Map<string, Record<string, unknown>>(),
  created: [] as Record<string, unknown>[],
  rows: [] as Record<string, unknown>[],
  finalPriceCents: 2000,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async () => ({ id: "student-1", email: "student@example.com", fullName: "Student Person" })),
}));
vi.mock("@/lib/staff-permissions", () => ({ requirePermission: vi.fn(), requireAnyPermissionForAction: vi.fn() }));
vi.mock("@/lib/communications/event-emails", () => ({
  sendEventPurchaseEmail: vi.fn(async () => ({ sent: true })),
  sendEventRefundEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock("@/lib/services/event-payment-email", () => ({ sendPaymentConfirmationEmail: vi.fn() }));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: vi.fn() }));
vi.mock("@/lib/domain/active-membership", () => ({ studentHasActiveMembership: vi.fn(async () => true) }));
vi.mock("@/lib/services/pricing-service", () => ({
  buildAuditDiscountMetadata: vi.fn(() => null),
  priceEventTicketForStudent: vi.fn(async () => ({
    basePriceCents: 2000,
    totalDiscountCents: 2000 - h.finalPriceCents,
    finalPriceCents: h.finalPriceCents,
    snapshot: null,
    promoCodeError: null,
  })),
  deserializePricingFromStripe: vi.fn(async () => null),
  readVatFromStripeMetadata: vi.fn(() => ({ vatApplied: false })),
}));
vi.mock("@/lib/repositories", () => {
  const repo = {
    getEventById: async (id: string) => h.events.get(id) ?? null,
    getProductsByEvent: async () => [
      {
        id: PRODUCT_ID,
        eventId: EVENT_ID,
        name: "Full Pass",
        priceCents: 2000,
        productType: "full_pass",
        salesOpen: true,
        membersOnly: false,
        inclusionRule: "all_sessions",
        includedSessionIds: null,
      },
    ],
    getPurchasesByStudent: async () => [],
    getPurchasesByEvent: async () => [],
    createPurchase: async (data: Record<string, unknown>) => {
      h.created.push(data);
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        receptionMethod: null,
        purchasedAt: now,
        refundedAt: null,
        refundedAmountCents: 0,
        refundStatus: null,
        stripeRefundId: null,
        guestName: null,
        guestEmail: null,
        paymentReference: null,
        paidAt: null,
        ...data,
      };
      h.rows.push(row);
      return row;
    },
  };
  return { getSpecialEventRepo: () => repo, getStudentRepo: () => ({ getById: async () => null }) };
});

import {
  createEventPurchaseAction,
  createFreeGuestEventPurchaseAction,
  createGuestEventPurchaseAction,
} from "../event-purchase";
import { fulfillEventPurchase, fulfillGuestEventPurchase } from "@/lib/services/event-purchase-fulfillment";

const guest = { firstName: "Guest", lastName: "Person", email: "guest@example.com" };
const ids = { eventId: EVENT_ID, eventProductId: PRODUCT_ID };
const stripeMeta = { bpm_event_id: EVENT_ID, bpm_event_product_id: PRODUCT_ID };

const PATHS: { label: string; run: () => Promise<{ success: boolean }>; paid: boolean }[] = [
  { label: "logged-in reception/manual purchase", run: () => createEventPurchaseAction(ids), paid: false },
  { label: "guest reception/manual purchase", run: () => createGuestEventPurchaseAction({ ...ids, ...guest }), paid: false },
  {
    label: "logged-in Stripe checkout fulfilment",
    run: () => fulfillEventPurchase("cs_test_student", { ...stripeMeta, bpm_student_id: "student-1" }),
    paid: true,
  },
  {
    label: "guest Stripe checkout fulfilment",
    run: () => fulfillGuestEventPurchase("cs_test_guest", { ...stripeMeta, bpm_guest_name: "Guest Person", bpm_guest_email: "guest@example.com" }),
    paid: true,
  },
];

beforeEach(() => {
  h.events.clear();
  h.events.set(EVENT_ID, { id: EVENT_ID, title: ORIGINAL_TITLE, isPublic: true, allowReceptionPayment: true, overallCapacity: null, coverImageUrl: null });
  h.created = [];
  h.rows = [];
  h.finalPriceCents = 2000;
});

describe("event title is frozen on every creation path", () => {
  it.each(PATHS)("$label", async ({ run }) => {
    const r = await run();
    expect(r.success).toBe(true);
    expect(h.created).toHaveLength(1);
    expect(h.created[0].eventTitleSnapshot).toBe(ORIGINAL_TITLE);
  });

  it("guest free / 100%-promo registration", async () => {
    h.finalPriceCents = 0;
    const r = await createFreeGuestEventPurchaseAction({ ...ids, ...guest, promoCode: "FREE100" });
    expect(r.success).toBe(true);
    expect(h.created[0].eventTitleSnapshot).toBe(ORIGINAL_TITLE);
  });

  it("the frozen title is read from the event record, trimmed — not from caller input", async () => {
    h.events.get(EVENT_ID)!.title = "  Spaced Title  ";
    await createGuestEventPurchaseAction({ ...ids, ...guest });
    expect(h.created[0].eventTitleSnapshot).toBe("Spaced Title");
  });

  it("a missing event creates no purchase", async () => {
    h.events.clear();
    const r = await fulfillEventPurchase("cs_test_x", { ...stripeMeta, bpm_student_id: "student-1" });
    expect(r.success).toBe(false);
    expect(h.created).toHaveLength(0);
  });
});

describe("renaming the event after purchase does not change the receipt", () => {
  it.each(PATHS.filter((p) => p.paid))("$label", async ({ run }) => {
    await run();
    const row = h.rows[0] as unknown as MockEventPurchase;
    const source = {
      kind: "event_purchase" as const,
      row,
      customer: { name: "Student Person", email: "student@example.com" },
    };
    const before = buildReceiptData(source, { businessHasVatNumber: false });
    if (!before.ok) throw new Error(`expected a receipt, got ${before.reason}`);
    expect(before.receipt.itemSecondaryLabel).toBe(ORIGINAL_TITLE);

    h.events.get(EVENT_ID)!.title = "RENAMED — Winter Intensive";

    const after = buildReceiptData(source, { businessHasVatNumber: false });
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain("RENAMED");
  });
});
