/**
 * Receipt links in payment emails, HTML escaping of customer-provided
 * text, and frozen amounts. Real templates; the email transport is faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; html: string }[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/utils/app-url", () => ({ getAppUrl: () => "https://preview.example.test" }));
vi.mock("../email-provider", () => ({
  isEmailEnabled: () => true,
  sendEmail: async (msg: { to: string; subject: string; html: string }) => {
    h.sent.push(msg);
    return true;
  },
}));
vi.mock("../email-resolver", () => ({ resolveStudentEmail: async () => "student@example.test" }));
vi.mock("@/lib/repositories", () => ({ getSpecialEventRepo: () => ({}) }));
vi.mock("@/lib/services/guest-receipt-delivery", () => ({ claimInitialGuestReceiptUrl: async () => null }));

import { sendEventPurchaseEmail, sendGuestReceiptEmail, type EventPurchaseEmailData } from "../event-emails";
import { buildEmailContent } from "../email-templates";
import { buildEmailData } from "@/lib/services/event-payment-email";
import type { MockEventProduct, MockEventPurchase, MockSpecialEvent } from "@/lib/mock-data";

const RECEIPT_URL = "https://preview.example.test/receipt#AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const HOSTILE = `<img src=x onerror="alert(1)">`;

function guestEmail(over: Partial<EventPurchaseEmailData> = {}): EventPurchaseEmailData {
  return {
    studentId: null,
    studentName: "Zaria Test",
    directEmail: "zaria.test@example.com",
    eventTitle: "Salsa Weekender",
    eventId: "evt-1",
    productName: "Full Pass",
    productType: "full_pass",
    priceLabel: "€45.00",
    paymentStatus: "paid",
    inclusionSummary: "All event sessions",
    qrToken: "qr-token-1",
    receiptUrl: RECEIPT_URL,
    ...over,
  };
}

const lastHtml = () => h.sent.at(-1)!.html;

beforeEach(() => {
  h.sent.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("guest event confirmation", () => {
  it("a paid guest purchase with a link gets the Download payment receipt button and keeps its QR", async () => {
    await sendEventPurchaseEmail(guestEmail());
    expect(h.sent).toHaveLength(1);
    expect(lastHtml()).toContain("Download payment receipt");
    expect(lastHtml()).toContain(`href="${RECEIPT_URL}"`);
    expect(lastHtml()).toContain(encodeURIComponent("qr-token-1"));
    expect(lastHtml()).not.toContain("View payments &amp; receipts");
  });

  it("no button when no link was issued (replay, free, ineligible) or the purchase is pending", async () => {
    await sendEventPurchaseEmail(guestEmail({ receiptUrl: undefined }));
    expect(lastHtml()).not.toContain("Download payment receipt");
    await sendEventPurchaseEmail(guestEmail({ paymentStatus: "pending" }));
    expect(lastHtml()).not.toContain("Download payment receipt");
    expect(lastHtml()).not.toContain("/receipt#");
  });

  it("escapes guest name, event title, product and inclusion text", async () => {
    await sendEventPurchaseEmail(
      guestEmail({ studentName: HOSTILE, eventTitle: HOSTILE, productName: HOSTILE, inclusionSummary: HOSTILE }),
    );
    expect(lastHtml()).not.toContain("<img src=x");
    expect(lastHtml()).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("does not log the receipt link", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEventPurchaseEmail(guestEmail());
    const logged = info.mock.calls.flat().map(String).join("\n");
    expect(logged).not.toContain("/receipt#");
    expect(logged).toContain("hasReceiptLink=true");
  });
});

describe("logged-in student emails", () => {
  it("a paid student event purchase links to /payments, never to a public receipt token", async () => {
    await sendEventPurchaseEmail(guestEmail({ studentId: "student-1", directEmail: undefined, receiptUrl: RECEIPT_URL }));
    expect(lastHtml()).toContain(`href="https://preview.example.test/payments"`);
    expect(lastHtml()).toContain("View payments &amp; receipts");
    expect(lastHtml()).not.toContain("/receipt#");
  });

  it("a pending student purchase has no receipts link", async () => {
    await sendEventPurchaseEmail(guestEmail({ studentId: "student-1", directEmail: undefined, paymentStatus: "pending" }));
    expect(lastHtml()).not.toContain("/payments");
  });

  it("subscription payment confirmation links to /payments and escapes text", () => {
    const { html } = buildEmailContent("payment_confirmed", HOSTILE, {
      productName: HOSTILE,
      subscriptionId: "sub-1",
      amountLabel: "€55.00",
      paymentMethod: HOSTILE,
    });
    expect(html).toContain(`href="https://preview.example.test/payments"`);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("/receipt#");
  });
});

describe("staff receipt email", () => {
  it("sends the link to the given recipient with escaped details", async () => {
    await sendGuestReceiptEmail({
      to: "zaria.test@example.com",
      recipientName: HOSTILE,
      eventTitle: HOSTILE,
      productName: "Full Pass",
      amountLabel: "€45.00",
      receiptUrl: RECEIPT_URL,
    });
    expect(h.sent[0].to).toBe("zaria.test@example.com");
    expect(lastHtml()).toContain(`href="${RECEIPT_URL}"`);
    expect(lastHtml()).toContain("€45.00");
    expect(lastHtml()).not.toContain("<img src=x");
  });
});

describe("buildEmailData amounts (mark paid / resend)", () => {
  const product = { id: "prod-1", name: "Full Pass (renamed)", productType: "full_pass", priceCents: 9999, inclusionRule: "all_sessions" } as MockEventProduct;
  const event = { id: "evt-1", title: "Live Title", coverImageUrl: null } as unknown as MockSpecialEvent;
  const base = {
    id: "p-1",
    studentId: null,
    guestName: "Zaria Test",
    guestEmail: "zaria.test@example.com",
    paymentStatus: "paid",
    paidAmountCents: 4500,
    originalAmountCents: 5000,
    discountAmountCents: 500,
    productNameSnapshot: "Full Pass",
    productTypeSnapshot: "full_pass",
    eventTitleSnapshot: "Salsa Weekender",
    qrToken: "qr",
  } as unknown as MockEventPurchase;

  it("paid: the frozen paid amount, not today's product price", () => {
    const data = buildEmailData(base, product, event);
    expect(data.priceLabel).toBe("€45.00");
    expect(data.productName).toBe("Full Pass");
    expect(data.eventTitle).toBe("Salsa Weekender");
  });

  it("pending: frozen original minus discount", () => {
    const data = buildEmailData({ ...base, paymentStatus: "pending", paidAmountCents: 0 }, product, event);
    expect(data.priceLabel).toBe("€45.00");
  });

  it("legacy row without amounts or title snapshot falls back to live values", () => {
    const data = buildEmailData(
      { ...base, paidAmountCents: null, originalAmountCents: null, eventTitleSnapshot: null } as unknown as MockEventPurchase,
      product,
      event,
    );
    expect(data.priceLabel).toBe("€99.99");
    expect(data.eventTitle).toBe("Live Title");
  });
});
