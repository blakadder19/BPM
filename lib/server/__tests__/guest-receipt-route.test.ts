/**
 * Guest receipts: the token is posted to /receipt/open (never in a URL).
 * A valid token yields that one purchase's PDF with private, no-referrer,
 * noindex headers; every other case is the same response.
 * Real handler, token service, memory token repository and PDF renderer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RECEIPT_BUSINESS_SETTINGS } from "@/lib/domain/receipt-settings";
import { formatReceiptReference } from "@/lib/domain/receipts";
import { generateReceiptToken, hashReceiptToken } from "@/lib/domain/receipt-token";
import { memoryReceiptTokenRepo, resetMemoryReceiptTokens } from "@/lib/repositories/memory/receipt-token-repository";

const h = vi.hoisted(() => ({ purchases: new Map<string, Record<string, unknown>>() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/data-provider", () => ({ isMemoryMode: () => false }));
vi.mock("@/lib/supabase/academy", () => ({ getAcademyName: async () => "Balance Power Motion" }));
vi.mock("@/lib/services/settings-store", () => ({
  hydrateSettings: async () => {},
  getReceiptBusinessSettings: () => ({ ...EMPTY_RECEIPT_BUSINESS_SETTINGS }),
}));
vi.mock("@/lib/repositories", () => ({
  getReceiptTokenRepo: () => memoryReceiptTokenRepo,
  getSpecialEventRepo: () => ({ getPurchaseById: async (id: string) => h.purchases.get(id) ?? null }),
  getSubscriptionRepo: () => ({}),
}));

import { handleGuestReceiptPost, handleGuestReceiptRequest } from "../guest-receipt-route";
import { issueGuestEventReceiptToken } from "@/lib/services/receipt-token-service";

const GUEST_A = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const GUEST_B = "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";

function guestPurchase(id: string, over: Record<string, unknown> = {}) {
  h.purchases.set(id, {
    id,
    eventId: "evt-1",
    studentId: null,
    guestName: "Zaria Tést Ñúñez",
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
  });
}

async function issue(id: string, expiresAt: string | null = null) {
  const r = await issueGuestEventReceiptToken({ eventPurchaseId: id, reason: "admin_send", createdBy: "staff-1", expiresAt });
  if (!r.ok) throw new Error(r.error);
  return r.rawToken;
}

async function snapshot(res: Response) {
  return { status: res.status, body: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
}

beforeEach(() => {
  resetMemoryReceiptTokens();
  h.purchases.clear();
  guestPurchase(GUEST_A);
  guestPurchase(GUEST_B, { guestEmail: "other@example.com" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("guest receipt token resolution", () => {
  it("serves the token's own purchase as a private PDF", async () => {
    const res = await handleGuestReceiptRequest(await issue(GUEST_A));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(formatReceiptReference("event_purchase", GUEST_A));
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("a token for one purchase never yields another purchase", async () => {
    const tokenB = await issue(GUEST_B);
    const res = await handleGuestReceiptRequest(tokenB);
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain(formatReceiptReference("event_purchase", GUEST_B));
    expect(disposition).not.toContain(formatReceiptReference("event_purchase", GUEST_A));
  });

  it("identical 404 for unknown, malformed, revoked, expired, hashed, id-as-token and ineligible", async () => {
    const revoked = await issue(GUEST_A);
    await issue(GUEST_A);
    const expired = await issue(GUEST_B, "2020-01-01T00:00:00.000Z");
    const ineligibleId = "2b3c4d5e-6f7a-4b1c-8d2e-4f5a6b7c8d9e";
    guestPurchase(ineligibleId);
    const ineligible = await issue(ineligibleId);
    guestPurchase(ineligibleId, { paymentStatus: "refunded", refundStatus: "pending", stripeRefundId: "re_1" });
    const linked = "3c4d5e6f-7a8b-4c1d-9e2f-5a6b7c8d9e0f";
    guestPurchase(linked);
    const linkedToken = await issue(linked);
    guestPurchase(linked, { studentId: "student-9" });

    const tokens = [
      generateReceiptToken().rawToken,
      "short",
      "",
      "../../etc/passwd",
      revoked,
      expired,
      hashReceiptToken(revoked),
      GUEST_A,
      ineligible,
      linkedToken,
    ];
    const snaps = await Promise.all(tokens.map(async (t) => snapshot(await handleGuestReceiptRequest(t))));
    for (const s of snaps) {
      expect(s.status).toBe(404);
      expect(s).toEqual(snaps[0]);
    }
    expect(snaps[0].headers["cache-control"]).toContain("no-store");
    expect(snaps[0].headers["referrer-policy"]).toBe("no-referrer");
    expect(snaps[0].headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("an internal error is indistinguishable from not found and does not log the token", async () => {
    const token = await issue(GUEST_A);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(memoryReceiptTokenRepo, "findByHash").mockRejectedValueOnce(new Error("db down"));
    const failed = await snapshot(await handleGuestReceiptRequest(token));
    const missing = await snapshot(await handleGuestReceiptRequest(generateReceiptToken().rawToken));
    expect(failed).toEqual(missing);
    expect(error.mock.calls.flat().map(String).join("\n")).not.toContain(token);
  });
});

function post(body: string) {
  return new Request("https://preview.example.test/receipt/open", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("POST /receipt/open", () => {
  it("downloads the PDF for a token sent in the form body", async () => {
    const token = await issue(GUEST_A);
    const res = await handleGuestReceiptPost(post(new URLSearchParams({ token }).toString()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("content-disposition")).toContain(formatReceiptReference("event_purchase", GUEST_A));
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("every failure is the same redirect to the explanation page, never carrying the token", async () => {
    const revoked = await issue(GUEST_A);
    await issue(GUEST_A);
    const bodies = [
      new URLSearchParams({ token: generateReceiptToken().rawToken }).toString(),
      new URLSearchParams({ token: revoked }).toString(),
      new URLSearchParams({ token: GUEST_A }).toString(),
      "token=",
      "",
      "other=1",
      `token=${"a".repeat(2000)}`,
    ];
    const snaps = await Promise.all(bodies.map(async (b) => snapshot(await handleGuestReceiptPost(post(b)))));
    for (const s of snaps) {
      expect(s.status).toBe(303);
      expect(s).toEqual(snaps[0]);
    }
    expect(snaps[0].headers.location).toBe("/receipt?unavailable=1");
    expect(snaps[0].headers["cache-control"]).toContain("no-store");
    expect(JSON.stringify(snaps)).not.toContain(revoked);
  });
});
