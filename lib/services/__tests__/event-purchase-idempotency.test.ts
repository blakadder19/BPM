/**
 * Stripe event fulfilment must create one purchase per Checkout Session
 * even when the webhook and the success page process it at the same time:
 * same-instance callers share one run, a row created by another instance
 * in the meantime is detected before the insert, and the 00083 unique
 * index violation is treated as "already fulfilled".
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  purchases: [] as Record<string, unknown>[],
  insertError: null as Error | null,
  lookupError: null as Error | null,
  lookups: 0,
  onSecondLookup: null as (() => void) | null,
  lookupArrivals: 0,
  createCalls: 0,
  purchaseEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/repositories", () => ({
  getStudentRepo: () => ({ getById: async () => null }),
  getSpecialEventRepo: () => ({
    getPurchaseById: async (id: string) => h.purchases.find((p) => p.id === id) ?? null,
    // Pairs concurrent lookups: an odd-numbered call waits (up to 20ms) for
    // the next one, so two racing runs pass each duplicate check together.
    getPurchaseByPaymentReference: async (ref: string) => {
      const arrival = ++h.lookupArrivals;
      for (let i = 0; i < 20 && arrival % 2 === 1 && h.lookupArrivals === arrival; i++) {
        await new Promise((r) => setTimeout(r, 1));
      }
      if (h.lookupError) throw h.lookupError;
      if (++h.lookups === 2) h.onSecondLookup?.();
      return h.purchases.find((p) => p.paymentReference === ref) ?? null;
    },
    getEventById: async (id: string) => ({ id, title: "Salsa Weekender", coverImageUrl: null }),
    getProductsByEvent: async () => {
      return [
        { id: "prod-1", name: "Full Pass", productType: "full_pass", priceCents: 5000, inclusionRule: "all_sessions", includedSessionIds: [] },
      ];
    },
    createPurchase: async (data: Record<string, unknown>) => {
      h.createCalls++;
      await new Promise((r) => setTimeout(r, 5));
      if (h.insertError) throw h.insertError;
      const row = { ...data, id: randomUUID(), purchasedAt: new Date().toISOString() };
      h.purchases.push(row);
      return row;
    },
  }),
}));
vi.mock("@/lib/communications/event-emails", () => ({
  sendEventPurchaseEmail: h.purchaseEmail,
}));
vi.mock("@/lib/services/guest-receipt-delivery", () => ({ claimInitialGuestReceiptUrl: async () => null }));
vi.mock("@/lib/services/event-payment-email", () => ({
  trackEmailSend: vi.fn(),
  sendPaymentConfirmationEmail: vi.fn(),
}));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: vi.fn() }));
vi.mock("@/lib/services/pricing-service", () => ({
  deserializePricingFromStripe: async () => null,
  readVatFromStripeMetadata: () => ({ vatApplied: false }),
  buildAuditDiscountMetadata: () => null,
}));

import { fulfillEventPurchase, fulfillGuestEventPurchase } from "../event-purchase-fulfillment";

const guestMeta = {
  bpm_purchase_type: "event_guest",
  bpm_event_id: "evt-1",
  bpm_event_product_id: "prod-1",
  bpm_guest_name: "Guest Person",
  bpm_guest_email: "guest@example.com",
};
const studentMeta = {
  bpm_purchase_type: "event",
  bpm_event_id: "evt-1",
  bpm_event_product_id: "prod-1",
  bpm_student_id: "student-1",
};
const UNIQUE_VIOLATION = new Error(
  'duplicate key value violates unique constraint "ux_event_purchases_stripe_reference"',
);

beforeEach(() => {
  h.purchases.length = 0;
  h.insertError = null;
  h.lookupError = null;
  h.lookups = 0;
  h.onSecondLookup = null;
  h.lookupArrivals = 0;
  h.createCalls = 0;
  h.purchaseEmail.mockReset().mockResolvedValue({ sent: true });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("guest event fulfilment", () => {
  it("webhook and success page at the same moment create one purchase and one email", async () => {
    const [webhook, successPage] = await Promise.all([
      fulfillGuestEventPurchase("cs_race", guestMeta),
      fulfillGuestEventPurchase("cs_race", guestMeta),
    ]);
    expect(webhook.success).toBe(true);
    expect(successPage.success).toBe(true);
    expect(h.purchases).toHaveLength(1);
    expect(h.createCalls).toBe(1);
    expect(h.purchaseEmail).toHaveBeenCalledTimes(1);
  });

  it("different sessions are not serialised into one", async () => {
    await Promise.all([
      fulfillGuestEventPurchase("cs_a", guestMeta),
      fulfillGuestEventPurchase("cs_b", guestMeta),
    ]);
    expect(h.purchases.map((p) => p.paymentReference).sort()).toEqual(["stripe:cs_a", "stripe:cs_b"]);
  });

  it("a later replay after completion is an idempotent skip", async () => {
    await fulfillGuestEventPurchase("cs_replay", guestMeta);
    const replay = await fulfillGuestEventPurchase("cs_replay", guestMeta);
    expect(replay).toMatchObject({ success: true, emailResult: { sent: false } });
    expect(h.purchases).toHaveLength(1);
    expect(h.purchaseEmail).toHaveBeenCalledTimes(1);
  });

  it("another instance's insert hitting the unique index is success without a second email", async () => {
    h.insertError = UNIQUE_VIOLATION;
    const r = await fulfillGuestEventPurchase("cs_cross", guestMeta);
    expect(r).toMatchObject({ success: true, emailResult: { sent: false } });
    expect(h.purchaseEmail).not.toHaveBeenCalled();
  });

  it("any other insert failure is still reported so Stripe retries", async () => {
    h.insertError = new Error("connection reset");
    const r = await fulfillGuestEventPurchase("cs_fail", guestMeta);
    expect(r.success).toBe(false);
    expect(h.purchaseEmail).not.toHaveBeenCalled();
  });

  it("a failed duplicate lookup never inserts", async () => {
    h.lookupError = new Error("db unavailable");
    await expect(fulfillGuestEventPurchase("cs_lookup", guestMeta)).rejects.toThrow("db unavailable");
    expect(h.createCalls).toBe(0);
  });
});

describe("student event fulfilment", () => {
  it("concurrent fulfilment of one session creates one purchase", async () => {
    const results = await Promise.all([
      fulfillEventPurchase("cs_student", studentMeta),
      fulfillEventPurchase("cs_student", studentMeta),
    ]);
    expect(results.every((r) => r.success)).toBe(true);
    expect(h.purchases).toHaveLength(1);
  });

  it("a row created elsewhere after the first check is found before inserting", async () => {
    h.onSecondLookup = () => {
      h.purchases.push({ id: "other-instance", paymentReference: "stripe:cs_late", studentId: "student-1" });
    };
    expect(await fulfillEventPurchase("cs_late", studentMeta)).toEqual({ success: true });
    expect(h.createCalls).toBe(0);
    expect(h.purchases).toHaveLength(1);
  });

  it("the unique index violation is treated as already fulfilled", async () => {
    h.insertError = UNIQUE_VIOLATION;
    expect(await fulfillEventPurchase("cs_student_cross", studentMeta)).toEqual({ success: true });
  });
});
