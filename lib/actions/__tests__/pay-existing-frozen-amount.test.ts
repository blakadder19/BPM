/**
 * Phase 23A — paying an existing pending plan charges only the amount frozen
 * on the row. A missing frozen amount is refused; the live product price is
 * never used as a fallback.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MISSING_FROZEN_AMOUNT_MESSAGE,
  NOTHING_TO_CHARGE_MESSAGE,
  resolvePayExistingChargeCents,
} from "@/lib/domain/pay-existing";

const h = vi.hoisted(() => ({
  sub: null as Record<string, unknown> | null,
  sessionsCreate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map([["host", "bpm.test"]]) }));
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async () => ({ id: "student-1", email: "student@example.com" })),
}));
vi.mock("@/lib/stripe", () => ({
  isStripeEnabled: () => true,
  getStripe: () => ({ checkout: { sessions: { create: h.sessionsCreate } } }),
}));
vi.mock("@/lib/repositories", () => ({
  getSubscriptionRepo: () => ({ getAll: async () => (h.sub ? [h.sub] : []) }),
  getProductRepo: () => ({
    getById: async () => ({ id: "prod-1", name: "Bronze Class Pass", priceCents: 9999 }),
  }),
}));
vi.mock("@/lib/services/purchase-subscription", () => ({ validateAndPreparePurchase: vi.fn() }));
vi.mock("@/lib/services/pricing-service", () => ({}));
vi.mock("@/lib/domain/active-membership", () => ({ studentHasActiveMembership: vi.fn() }));

import { payPendingSubscriptionAction } from "../stripe-checkout";

function pendingSub(over: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    studentId: "student-1",
    productId: "prod-1",
    productName: "Bronze Class Pass",
    paymentStatus: "pending",
    termId: null,
    priceCentsAtPurchase: 4500,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sub = pendingSub();
  h.sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
});

describe("resolvePayExistingChargeCents", () => {
  it("returns the frozen amount", () => {
    expect(resolvePayExistingChargeCents({ priceCentsAtPurchase: 4500 })).toEqual({ ok: true, chargeCents: 4500 });
  });

  it.each([null, undefined, -1, 12.5, Number.NaN])("refuses %s with the exact contact-BPM message", (value) => {
    expect(resolvePayExistingChargeCents({ priceCentsAtPurchase: value as number | null })).toEqual({
      ok: false,
      error: MISSING_FROZEN_AMOUNT_MESSAGE,
    });
  });

  it("refuses a €0 plan (nothing to charge)", () => {
    expect(resolvePayExistingChargeCents({ priceCentsAtPurchase: 0 })).toEqual({ ok: false, error: NOTHING_TO_CHARGE_MESSAGE });
  });

  it("uses the approved wording", () => {
    expect(MISSING_FROZEN_AMOUNT_MESSAGE).toBe(
      "This plan is missing its original payment amount. Please contact BPM before paying.",
    );
  });
});

describe("payPendingSubscriptionAction", () => {
  it("charges the frozen amount, not the live product price", async () => {
    const r = await payPendingSubscriptionAction("sub-1");
    expect(r.success).toBe(true);
    const lineItem = h.sessionsCreate.mock.calls[0][0].line_items[0];
    expect(lineItem.price_data.unit_amount).toBe(4500);
  });

  it("refuses a row with no frozen amount and never opens a Stripe session", async () => {
    h.sub = pendingSub({ priceCentsAtPurchase: null });
    const r = await payPendingSubscriptionAction("sub-1");
    expect(r).toEqual({ success: false, error: MISSING_FROZEN_AMOUNT_MESSAGE });
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses a €0 frozen amount without opening a Stripe session", async () => {
    h.sub = pendingSub({ priceCentsAtPurchase: 0 });
    const r = await payPendingSubscriptionAction("sub-1");
    expect(r.success).toBe(false);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });
});
