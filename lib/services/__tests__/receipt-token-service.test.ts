/**
 * Phase 23A — guest event receipt link credentials. Uses the real memory
 * token repository; only the event purchase lookup is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateReceiptToken,
  hashReceiptToken,
  isReceiptTokenUsable,
  isWellFormedReceiptToken,
  isWellFormedTokenHash,
} from "@/lib/domain/receipt-token";
import { memoryReceiptTokenRepo, resetMemoryReceiptTokens } from "@/lib/repositories/memory/receipt-token-repository";

const h = vi.hoisted(() => ({ purchases: new Map<string, Record<string, unknown>>() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/repositories", () => ({
  getReceiptTokenRepo: () => memoryReceiptTokenRepo,
  getSpecialEventRepo: () => ({ getPurchaseById: async (id: string) => h.purchases.get(id) ?? null }),
}));

import {
  issueGuestEventReceiptToken,
  resolveGuestEventReceiptToken,
  revokeGuestEventReceiptTokens,
} from "../receipt-token-service";

const GUEST_A = "8d7c6b5a-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const GUEST_B = "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
const STUDENT_P = "2b3c4d5e-6f7a-4b1c-8d2e-4f5a6b7c8d9e";

function guestPurchase(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    studentId: null,
    guestName: "Guest Person",
    guestEmail: "guest@example.com",
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
    paymentReference: "stripe:cs_live_evt",
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
}

async function issue(id = GUEST_A) {
  const r = await issueGuestEventReceiptToken({ eventPurchaseId: id, reason: "purchase_email", createdBy: null });
  if (!r.ok) throw new Error(`issue failed: ${r.error}`);
  return r;
}

beforeEach(() => {
  resetMemoryReceiptTokens();
  h.purchases.clear();
  h.purchases.set(GUEST_A, guestPurchase(GUEST_A));
  h.purchases.set(GUEST_B, guestPurchase(GUEST_B, { guestEmail: "other@example.com" }));
  h.purchases.set(STUDENT_P, guestPurchase(STUDENT_P, { studentId: "student-1", guestEmail: null, guestName: null }));
});

describe("receipt token primitives", () => {
  it("generates a 256-bit url-safe token and stores only its SHA-256", () => {
    const { rawToken, tokenHash } = generateReceiptToken();
    expect(isWellFormedReceiptToken(rawToken)).toBe(true);
    expect(isWellFormedTokenHash(tokenHash)).toBe(true);
    expect(tokenHash).toBe(hashReceiptToken(rawToken));
    expect(tokenHash).not.toContain(rawToken);
  });

  it("never repeats a token", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateReceiptToken().rawToken));
    expect(seen.size).toBe(200);
  });

  it("rejects malformed tokens", () => {
    for (const bad of [undefined, null, 42, "", "short", "a".repeat(44), `${"a".repeat(42)}=`, GUEST_A]) {
      expect(isWellFormedReceiptToken(bad)).toBe(false);
    }
  });

  it("usable = not revoked and not expired; no expiry by default", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const base = { revokedAt: null, expiresAt: null };
    expect(isReceiptTokenUsable(base, now)).toBe(true);
    expect(isReceiptTokenUsable({ ...base, revokedAt: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isReceiptTokenUsable({ ...base, expiresAt: "2026-11-17T11:59:59Z" }, now)).toBe(false);
    expect(isReceiptTokenUsable({ ...base, expiresAt: "2026-11-18T00:00:00Z" }, now)).toBe(true);
  });
});

describe("issueGuestEventReceiptToken", () => {
  it("stores the hash only and returns the frozen guest email as the sole recipient", async () => {
    const r = await issue();
    expect(r.recipientEmail).toBe("guest@example.com");
    const stored = await memoryReceiptTokenRepo.findByHash(hashReceiptToken(r.rawToken));
    expect(stored?.eventPurchaseId).toBe(GUEST_A);
    expect(JSON.stringify(stored)).not.toContain(r.rawToken);
    expect(stored?.expiresAt).toBeNull();
  });

  it("refuses logged-in student purchases (they use ownership routes)", async () => {
    const r = await issueGuestEventReceiptToken({ eventPurchaseId: STUDENT_P, reason: "admin_send", createdBy: "admin-1" });
    expect(r).toEqual({ ok: false, error: "not_guest_purchase" });
  });

  it("refuses unknown purchases, purchases without a guest email, and ineligible purchases", async () => {
    expect(
      await issueGuestEventReceiptToken({ eventPurchaseId: "00000000-0000-4000-8000-000000000000", reason: "admin_send", createdBy: "a" }),
    ).toEqual({ ok: false, error: "purchase_not_found" });

    h.purchases.set(GUEST_A, guestPurchase(GUEST_A, { guestEmail: "  " }));
    expect((await issueGuestEventReceiptToken({ eventPurchaseId: GUEST_A, reason: "admin_send", createdBy: "a" })).ok).toBe(false);

    h.purchases.set(GUEST_A, guestPurchase(GUEST_A, { paidAmountCents: 0 }));
    expect(await issueGuestEventReceiptToken({ eventPurchaseId: GUEST_A, reason: "admin_send", createdBy: "a" })).toEqual({
      ok: false,
      error: "not_receipt_eligible",
      reason: "no_payment_taken",
    });

    h.purchases.set(GUEST_A, guestPurchase(GUEST_A, { paymentStatus: "pending" }));
    const pending = await issueGuestEventReceiptToken({ eventPurchaseId: GUEST_A, reason: "admin_send", createdBy: "a" });
    expect(pending).toMatchObject({ ok: false, error: "not_receipt_eligible" });

    h.purchases.set(GUEST_A, guestPurchase(GUEST_A, { eventTitleSnapshot: null }));
    expect(await issueGuestEventReceiptToken({ eventPurchaseId: GUEST_A, reason: "admin_send", createdBy: "a" })).toEqual({
      ok: false,
      error: "not_receipt_eligible",
      reason: "event_title_missing",
    });
  });

  it("resend revokes the previous token and issues a new one", async () => {
    const first = await issue();
    const second = await issueGuestEventReceiptToken({ eventPurchaseId: GUEST_A, reason: "admin_send", createdBy: "admin-1" });
    if (!second.ok) throw new Error("second issue failed");
    expect(second.rawToken).not.toBe(first.rawToken);
    expect(await resolveGuestEventReceiptToken(first.rawToken)).toEqual({ ok: false });
    expect(await resolveGuestEventReceiptToken(second.rawToken)).toMatchObject({ ok: true, eventPurchaseId: GUEST_A });
  });
});

describe("resolveGuestEventReceiptToken", () => {
  it("authorizes exactly one purchase via the hash lookup and records use", async () => {
    const a = await issue(GUEST_A);
    const b = await issue(GUEST_B);
    const now = new Date("2026-11-17T12:00:00Z");
    expect(await resolveGuestEventReceiptToken(a.rawToken, now)).toMatchObject({
      ok: true,
      eventPurchaseId: GUEST_A,
      tokenId: a.tokenId,
      purchase: { id: GUEST_A },
    });
    expect(await resolveGuestEventReceiptToken(b.rawToken, now)).toMatchObject({
      ok: true,
      eventPurchaseId: GUEST_B,
      tokenId: b.tokenId,
      purchase: { id: GUEST_B },
    });
    const stored = await memoryReceiptTokenRepo.findByHash(hashReceiptToken(a.rawToken));
    expect(stored?.lastUsedAt).toBe(now.toISOString());
  });

  it("denies a wrong or malformed token, the purchase id, or the email", async () => {
    await issue();
    expect(await resolveGuestEventReceiptToken(generateReceiptToken().rawToken)).toEqual({ ok: false });
    expect(await resolveGuestEventReceiptToken(GUEST_A)).toEqual({ ok: false });
    expect(await resolveGuestEventReceiptToken("guest@example.com")).toEqual({ ok: false });
    expect(await resolveGuestEventReceiptToken(undefined)).toEqual({ ok: false });
  });

  it("denies a token whose hash is presented instead of the token", async () => {
    const a = await issue();
    expect(await resolveGuestEventReceiptToken(hashReceiptToken(a.rawToken))).toEqual({ ok: false });
  });

  it("denies a revoked token", async () => {
    const a = await issue();
    expect(await revokeGuestEventReceiptTokens(GUEST_A)).toBe(1);
    expect(await resolveGuestEventReceiptToken(a.rawToken)).toEqual({ ok: false });
  });

  it("denies an expired token", async () => {
    const r = await issueGuestEventReceiptToken({
      eventPurchaseId: GUEST_A,
      reason: "admin_send",
      createdBy: "admin-1",
      expiresAt: "2026-11-20T00:00:00Z",
    });
    if (!r.ok) throw new Error("issue failed");
    expect((await resolveGuestEventReceiptToken(r.rawToken, new Date("2026-11-19T00:00:00Z"))).ok).toBe(true);
    expect(await resolveGuestEventReceiptToken(r.rawToken, new Date("2026-11-20T00:00:01Z"))).toEqual({ ok: false });
  });

  it("denies once the purchase is no longer receipt-eligible (e.g. refund now pending)", async () => {
    const a = await issue();
    h.purchases.set(
      GUEST_A,
      guestPurchase(GUEST_A, { paymentStatus: "refunded", refundStatus: "pending", stripeRefundId: "re_wait" }),
    );
    expect(await resolveGuestEventReceiptToken(a.rawToken)).toEqual({ ok: false });
  });

  it("denies (rather than throws) for a stored status outside the typed union", async () => {
    const a = await issue();
    h.purchases.set(GUEST_A, guestPurchase(GUEST_A, { paymentStatus: "cancelled" }));
    expect(await resolveGuestEventReceiptToken(a.rawToken)).toEqual({ ok: false });
  });

  it("denies if the purchase has since been linked to a student account", async () => {
    const a = await issue();
    h.purchases.set(GUEST_A, guestPurchase(GUEST_A, { studentId: "student-9" }));
    expect(await resolveGuestEventReceiptToken(a.rawToken)).toEqual({ ok: false });
  });
});
