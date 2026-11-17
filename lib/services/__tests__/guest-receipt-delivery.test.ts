/**
 * Guest receipt link delivery: the automatic confirmation link is issued
 * at most once per purchase and never revokes anything (Stripe replays
 * included); a staff resend rotates the link and rolls back if the email
 * is not accepted. Uses the real memory token repository, token service,
 * delivery service and guest Stripe fulfilment; the event repository and
 * the email transport are faked.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryReceiptTokenRepo, resetMemoryReceiptTokens } from "@/lib/repositories/memory/receipt-token-repository";

const h = vi.hoisted(() => ({
  purchases: new Map<string, Record<string, unknown>>(),
  purchaseEmail: vi.fn(),
  receiptEmail: vi.fn(),
  trackEmailSend: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/utils/app-url", () => ({ getAppUrl: () => "https://preview.example.test" }));
vi.mock("@/lib/repositories", () => ({
  getReceiptTokenRepo: () => memoryReceiptTokenRepo,
  getSpecialEventRepo: () => ({
    getPurchaseById: async (id: string) => h.purchases.get(id) ?? null,
    getPurchasesByEvent: async (eventId: string) => [...h.purchases.values()].filter((p) => p.eventId === eventId),
    getEventById: async (id: string) => ({ id, title: "Salsa <Night> & Co", coverImageUrl: null }),
    getProductsByEvent: async () => [
      { id: "prod-1", name: "Full Pass", productType: "full_pass", priceCents: 9999, inclusionRule: "all_sessions", includedSessionIds: [] },
    ],
    createPurchase: async (data: Record<string, unknown>) => {
      const row = {
        refundedAt: null,
        refundedAmountCents: 0,
        refundStatus: null,
        stripeRefundId: null,
        receptionMethod: null,
        purchasedAt: new Date().toISOString(),
        ...data,
        id: randomUUID(),
      };
      h.purchases.set(row.id, row);
      return row;
    },
  }),
}));
vi.mock("@/lib/communications/event-emails", () => ({
  sendEventPurchaseEmail: h.purchaseEmail,
  sendGuestReceiptEmail: h.receiptEmail,
}));
vi.mock("@/lib/services/event-payment-email", () => ({
  trackEmailSend: h.trackEmailSend,
  sendPaymentConfirmationEmail: vi.fn(),
}));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: vi.fn() }));
vi.mock("@/lib/services/pricing-service", () => ({
  deserializePricingFromStripe: async () => null,
  readVatFromStripeMetadata: () => ({ vatApplied: false }),
}));

import { claimInitialGuestReceiptUrl, sendStaffGuestReceipt } from "../guest-receipt-delivery";
import { resolveGuestEventReceiptToken } from "../receipt-token-service";
import { fulfillGuestEventPurchase } from "../event-purchase-fulfillment";

const GUEST = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const STUDENT_P = "2b3c4d5e-6f7a-4b1c-8d2e-4f5a6b7c8d9e";

function guestPurchase(id: string, over: Record<string, unknown> = {}) {
  const row = {
    id,
    eventId: "evt-1",
    studentId: null,
    guestName: "Zaria Test",
    guestEmail: "zaria.test@example.com",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    receptionMethod: null,
    paidAt: "2026-10-05T18:00:00.000Z",
    purchasedAt: "2026-10-05T17:59:00.000Z",
    paidAmountCents: 4500,
    originalAmountCents: 5000,
    discountAmountCents: 500,
    currency: "eur",
    productNameSnapshot: "Full Pass",
    productTypeSnapshot: "full_pass",
    eventTitleSnapshot: "Salsa Weekender",
    paymentReference: "stripe:cs_test_x",
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

function tokenFromUrl(url: string): string {
  const prefix = "https://preview.example.test/receipt/";
  expect(url.startsWith(prefix)).toBe(true);
  return url.slice(prefix.length);
}

const logged: string[] = [];

beforeEach(() => {
  resetMemoryReceiptTokens();
  h.purchases.clear();
  h.purchaseEmail.mockReset().mockResolvedValue({ sent: true });
  h.receiptEmail.mockReset().mockResolvedValue({ sent: true });
  h.trackEmailSend.mockReset();
  logged.length = 0;
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
  guestPurchase(GUEST);
  guestPurchase(STUDENT_P, { studentId: "student-1", guestName: null, guestEmail: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectNoTokenLogged(...rawTokens: string[]) {
  const all = logged.join("\n");
  for (const t of rawTokens) {
    expect(all).not.toContain(t);
  }
  expect(all).not.toContain("/receipt/");
}

describe("claimInitialGuestReceiptUrl (automatic confirmation email)", () => {
  it("issues one working link for an eligible paid guest purchase", async () => {
    const url = await claimInitialGuestReceiptUrl(GUEST);
    expect(url).not.toBeNull();
    const raw = tokenFromUrl(url!);
    expect(await resolveGuestEventReceiptToken(raw)).toMatchObject({ ok: true, eventPurchaseId: GUEST });
    expectNoTokenLogged(raw);
  });

  it("a repeated claim returns no link and leaves the first link working", async () => {
    const first = tokenFromUrl((await claimInitialGuestReceiptUrl(GUEST))!);
    expect(await claimInitialGuestReceiptUrl(GUEST)).toBeNull();
    expect(await claimInitialGuestReceiptUrl(GUEST)).toBeNull();
    expect(await resolveGuestEventReceiptToken(first)).toMatchObject({ ok: true });
    expect(await memoryReceiptTokenRepo.listPurchasesWithActiveToken([GUEST])).toEqual(new Set([GUEST]));
  });

  it("concurrent claims produce exactly one link", async () => {
    const urls = await Promise.all([claimInitialGuestReceiptUrl(GUEST), claimInitialGuestReceiptUrl(GUEST)]);
    expect(urls.filter(Boolean)).toHaveLength(1);
  });

  it.each([
    ["a logged-in student purchase", STUDENT_P, {}],
    ["a pending purchase", GUEST, { paymentStatus: "pending", paidAt: null }],
    ["a free registration", GUEST, { paidAmountCents: 0, originalAmountCents: 0, discountAmountCents: 0 }],
    ["€0 after a full discount", GUEST, { paidAmountCents: 0, originalAmountCents: 5000, discountAmountCents: 5000 }],
    ["a refund without a recorded amount", GUEST, { paymentStatus: "refunded", refundedAt: "2026-11-01T00:00:00Z", refundedAmountCents: 0 }],
    ["a Stripe refund still pending", GUEST, { paymentStatus: "refunded", refundStatus: "pending", stripeRefundId: "re_1" }],
  ])("gives no link for %s", async (_label, id, over) => {
    if (id === GUEST) guestPurchase(GUEST, over);
    expect(await claimInitialGuestReceiptUrl(id)).toBeNull();
    expect(await memoryReceiptTokenRepo.listPurchasesWithActiveToken([id])).toEqual(new Set());
  });

  it("never throws: a token failure means no link, not a lost confirmation", async () => {
    vi.spyOn(memoryReceiptTokenRepo, "insertIfNoActive").mockRejectedValueOnce(new Error("db down"));
    expect(await claimInitialGuestReceiptUrl(GUEST)).toBeNull();
  });
});

describe("fulfillGuestEventPurchase (Stripe webhook / success page)", () => {
  const metadata = {
    bpm_purchase_type: "event_guest",
    bpm_event_id: "evt-1",
    bpm_event_product_id: "prod-1",
    bpm_guest_name: "Zaria Test",
    bpm_guest_email: "zaria.test@example.com",
  };

  beforeEach(() => {
    h.purchases.clear();
  });

  it("sends one confirmation with a receipt link; a replay sends nothing and revokes nothing", async () => {
    const first = await fulfillGuestEventPurchase("cs_test_replay", metadata);
    expect(first.success).toBe(true);
    expect(h.purchaseEmail).toHaveBeenCalledTimes(1);
    const sent = h.purchaseEmail.mock.calls[0][0];
    expect(sent.qrToken).toEqual(expect.any(String));
    const raw = tokenFromUrl(sent.receiptUrl);

    const replay = await fulfillGuestEventPurchase("cs_test_replay", metadata);
    expect(replay.success).toBe(true);
    expect(h.purchaseEmail).toHaveBeenCalledTimes(1);
    expect(h.purchases.size).toBe(1);
    expect(await resolveGuestEventReceiptToken(raw)).toMatchObject({ ok: true });
    expectNoTokenLogged(raw);
  });

  it("the email uses the amount, title and product frozen on the created purchase", async () => {
    await fulfillGuestEventPurchase("cs_test_amount", metadata);
    const row = [...h.purchases.values()][0];
    const sent = h.purchaseEmail.mock.calls[0][0];
    expect(sent.priceLabel).toBe(`€${((row.paidAmountCents as number) / 100).toFixed(2)}`);
    expect(sent.eventTitle).toBe(row.eventTitleSnapshot);
    expect(sent.productName).toBe(row.productNameSnapshot);
  });
});

describe("sendStaffGuestReceipt (Send / Resend receipt)", () => {
  it("rotates: the new link works, the old one stops, the email goes to the stored guest email", async () => {
    const old = tokenFromUrl((await claimInitialGuestReceiptUrl(GUEST))!);
    const result = await sendStaffGuestReceipt({ eventPurchaseId: GUEST, staffUserId: "staff-1" });
    expect(result).toMatchObject({ ok: true, recipientEmail: "zaria.test@example.com", replacedPreviousLink: true, eventId: "evt-1" });

    expect(h.receiptEmail).toHaveBeenCalledTimes(1);
    const email = h.receiptEmail.mock.calls[0][0];
    expect(email.to).toBe("zaria.test@example.com");
    expect(email.amountLabel).toBe("€45.00");
    const fresh = tokenFromUrl(email.receiptUrl);
    expect(await resolveGuestEventReceiptToken(fresh)).toMatchObject({ ok: true, eventPurchaseId: GUEST });
    expect(await resolveGuestEventReceiptToken(old)).toEqual({ ok: false });
    expectNoTokenLogged(old, fresh);
    expect(JSON.stringify(result)).not.toContain(fresh);
  });

  it("first send (no earlier link) reports nothing replaced", async () => {
    const result = await sendStaffGuestReceipt({ eventPurchaseId: GUEST, staffUserId: "staff-1" });
    expect(result).toMatchObject({ ok: true, replacedPreviousLink: false });
  });

  it("a failed email keeps the customer's existing link working and kills the undelivered one", async () => {
    const old = tokenFromUrl((await claimInitialGuestReceiptUrl(GUEST))!);
    h.receiptEmail.mockResolvedValueOnce({ sent: false, reason: "Brevo rejected" });
    const result = await sendStaffGuestReceipt({ eventPurchaseId: GUEST, staffUserId: "staff-1" });
    expect(result).toMatchObject({ ok: false, code: "send_failed", previousLinkActive: true });
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toContain("previous receipt link still works");

    const undelivered = tokenFromUrl(h.receiptEmail.mock.calls[0][0].receiptUrl);
    expect(await resolveGuestEventReceiptToken(undelivered)).toEqual({ ok: false });
    expect(await resolveGuestEventReceiptToken(old)).toMatchObject({ ok: true });
    expectNoTokenLogged(old, undelivered);
  });

  it("a thrown email error is handled the same way", async () => {
    const old = tokenFromUrl((await claimInitialGuestReceiptUrl(GUEST))!);
    h.receiptEmail.mockRejectedValueOnce(new Error("network"));
    const result = await sendStaffGuestReceipt({ eventPurchaseId: GUEST, staffUserId: "staff-1" });
    expect(result).toMatchObject({ ok: false, code: "send_failed", previousLinkActive: true });
    expect(await resolveGuestEventReceiptToken(old)).toMatchObject({ ok: true });
  });

  it("a failed first send leaves no active link", async () => {
    h.receiptEmail.mockResolvedValueOnce({ sent: false, reason: "Brevo rejected" });
    const result = await sendStaffGuestReceipt({ eventPurchaseId: GUEST, staffUserId: "staff-1" });
    expect(result).toMatchObject({ ok: false, code: "send_failed", previousLinkActive: false });
    expect(await memoryReceiptTokenRepo.listPurchasesWithActiveToken([GUEST])).toEqual(new Set());
  });

  it.each([
    ["not_guest", STUDENT_P, {}],
    ["not_eligible", GUEST, { paidAmountCents: 0, originalAmountCents: 0 }],
    ["not_eligible", GUEST, { paymentStatus: "pending", paidAt: null }],
    ["no_email", GUEST, { guestEmail: "  " }],
    ["not_found", "00000000-0000-4000-8000-000000000000", {}],
  ])("refuses (%s) without sending or touching existing links", async (code, id, over) => {
    if (id === GUEST) guestPurchase(GUEST, over);
    const result = await sendStaffGuestReceipt({ eventPurchaseId: id, staffUserId: "staff-1" });
    expect(result).toMatchObject({ ok: false, code });
    expect(h.receiptEmail).not.toHaveBeenCalled();
  });
});
