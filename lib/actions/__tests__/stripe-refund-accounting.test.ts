/**
 * Phase 23A — Stripe refund accounting. Money is recorded as returned
 * (refunded_amount_cents, refunded_at, payment_status "refunded") only once
 * Stripe reports the refund as succeeded. Uses the real action and the real
 * outcome service; Stripe, repositories and write services are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sub: null as Record<string, unknown> | null,
  purchase: null as Record<string, unknown> | null,
  refundsCreate: vi.fn(),
  updateSubscription: vi.fn(),
  refundPurchase: vi.fn(),
  logFinanceEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/stripe", () => ({
  isStripeEnabled: () => true,
  getStripe: () => ({
    checkout: { sessions: { retrieve: vi.fn(async () => ({ payment_intent: "pi_123" })) } },
    refunds: { create: h.refundsCreate },
  }),
}));
vi.mock("@/lib/staff-permissions", () => ({
  requireAnyPermissionForAction: vi.fn(async () => ({
    ok: true,
    access: { user: { id: "admin-1", email: "admin@example.com", fullName: "Admin" } },
  })),
}));
vi.mock("@/lib/repositories", () => ({
  getSubscriptionRepo: () => ({ getById: async () => h.sub }),
  getSpecialEventRepo: () => ({ getPurchaseById: async () => h.purchase }),
}));
vi.mock("@/lib/services/subscription-service", () => ({ updateSubscription: h.updateSubscription }));
vi.mock("@/lib/services/special-event-service", () => ({ refundPurchase: h.refundPurchase }));
vi.mock("@/lib/services/finance-audit-log", () => ({ logFinanceEvent: h.logFinanceEvent }));

import { issueStripeRefundAction } from "../stripe-refund";
import { reconcileStripeRefundUpdate } from "@/lib/services/stripe-refund-outcome";

function stripeSub(over: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    paymentMethod: "stripe",
    paymentReference: "stripe:cs_test_1",
    priceCentsAtPurchase: 5500,
    refundedAmountCents: 0,
    refundStatus: null,
    stripeRefundId: null,
    paymentStatus: "paid",
    currencyAtPurchase: "EUR",
    productName: "Bronze Class Pass",
    vatAmountCents: null,
    vatRatePercent: null,
    ...over,
  };
}

function stripePurchase(over: Record<string, unknown> = {}) {
  return {
    id: "ep-1",
    paymentMethod: "stripe",
    paymentReference: "stripe:cs_test_2",
    paidAmountCents: 9000,
    refundedAmountCents: 0,
    refundStatus: null,
    stripeRefundId: null,
    paymentStatus: "paid",
    currency: "eur",
    productNameSnapshot: "Beginners Course",
    vatAmountCents: null,
    vatRatePercent: null,
    ...over,
  };
}

const refundSub = (amountCents = 5500) =>
  issueStripeRefundAction({ kind: "subscription", id: "sub-1", amountCents, reason: "customer request" });

const lastAudit = () => h.logFinanceEvent.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  h.sub = stripeSub();
  h.purchase = stripePurchase();
  h.updateSubscription.mockResolvedValue({ success: true });
  h.refundPurchase.mockResolvedValue({ success: true });
});

describe("issueStripeRefundAction — refund accounting", () => {
  it("succeeded: records the confirmed amount, refund date and refunded status", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_ok", status: "succeeded" });
    const r = await refundSub();
    expect(r).toMatchObject({ success: true, stripeRefundId: "re_ok", refundStatus: "succeeded", fullRefund: true });
    const patch = h.updateSubscription.mock.calls[0][1];
    expect(patch).toMatchObject({
      stripeRefundId: "re_ok",
      refundStatus: "succeeded",
      refundedAmountCents: 5500,
      paymentStatus: "refunded",
      refundReason: "customer request",
    });
    expect(typeof patch.refundedAt).toBe("string");
    expect(lastAudit()).toMatchObject({ action: "refunded", newValue: "refunded" });
  });

  it("failed: never increases the confirmed amount, never stamps a refund date, never flips status", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_bad", status: "failed" });
    const r = await refundSub();
    expect(r.success).toBe(false);
    expect(r.refundStatus).toBe("failed");
    expect(r.error).toMatch(/failed/);
    const patch = h.updateSubscription.mock.calls[0][1];
    expect(patch).toEqual({ stripeRefundId: "re_bad", refundStatus: "failed" });
    expect(lastAudit()).toMatchObject({ action: "status_changed", newValue: "refund_failed" });
    expect(lastAudit().metadata.refundedAmountCents).toBe(0);
    expect(lastAudit().metadata.cumulativeRefundedAmountCents).toBe(0);
  });

  it("canceled is treated as failed", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_c", status: "canceled" });
    await refundSub();
    expect(h.updateSubscription.mock.calls[0][1]).toEqual({ stripeRefundId: "re_c", refundStatus: "failed" });
  });

  it("failed after an earlier confirmed partial refund leaves the row untouched", async () => {
    h.sub = stripeSub({ refundedAmountCents: 2000, refundStatus: "succeeded", stripeRefundId: "re_prev" });
    h.refundsCreate.mockResolvedValue({ id: "re_bad", status: "failed" });
    await refundSub(1000);
    expect(h.updateSubscription).not.toHaveBeenCalled();
    expect(lastAudit().metadata.cumulativeRefundedAmountCents).toBe(2000);
  });

  it("thrown Stripe request: no BPM write and no audit entry", async () => {
    h.refundsCreate.mockRejectedValue(new Error("card_declined"));
    const r = await refundSub();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Stripe could not create the refund/);
    expect(h.updateSubscription).not.toHaveBeenCalled();
    expect(h.refundPurchase).not.toHaveBeenCalled();
    expect(h.logFinanceEvent).not.toHaveBeenCalled();
  });

  it("pending: records the pending attempt but no money, no refund date, no refunded status", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_wait", status: "pending" });
    const r = await refundSub();
    expect(r.success).toBe(false);
    expect(r.refundStatus).toBe("pending");
    expect(r.refundedAmountCents).toBe(0);
    expect(r.error).toMatch(/not confirmed it yet/);
    const patch = h.updateSubscription.mock.calls[0][1];
    expect(patch).toEqual({
      stripeRefundId: "re_wait",
      refundStatus: "pending",
      refundedBy: "Admin",
      refundReason: "customer request",
    });
    expect(lastAudit()).toMatchObject({ action: "status_changed", newValue: "refund_pending" });
  });

  it("requires_action is treated as pending, not as failed", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_ra", status: "requires_action" });
    const r = await refundSub();
    expect(r.refundStatus).toBe("pending");
  });

  it("a pending earlier refund blocks a new one before Stripe is called", async () => {
    h.sub = stripeSub({ refundStatus: "pending", stripeRefundId: "re_wait" });
    const r = await refundSub(1000);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/still pending/);
    expect(h.refundsCreate).not.toHaveBeenCalled();
  });

  it("cumulative successful partial refunds add up and flip to refunded at the full amount", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_1", status: "succeeded" });
    await refundSub(2000);
    expect(h.updateSubscription.mock.calls[0][1]).toMatchObject({ refundedAmountCents: 2000 });
    expect(h.updateSubscription.mock.calls[0][1].paymentStatus).toBeUndefined();

    h.sub = stripeSub({ refundedAmountCents: 2000, refundStatus: "succeeded", stripeRefundId: "re_1" });
    h.refundsCreate.mockResolvedValue({ id: "re_2", status: "succeeded" });
    await refundSub(3500);
    expect(h.updateSubscription.mock.calls[1][1]).toMatchObject({ refundedAmountCents: 5500, paymentStatus: "refunded" });
  });

  it("event purchase pending: passes fullRefund false and no refund date", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_ev", status: "pending" });
    await issueStripeRefundAction({ kind: "event_purchase", id: "ep-1", amountCents: 9000, reason: "event cancelled" });
    const patch = h.refundPurchase.mock.calls[0][1];
    expect(patch.fullRefund).toBe(false);
    expect(patch.refundedAt).toBeUndefined();
    expect(patch.refundedAmountCents).toBeUndefined();
    expect(patch.refundStatus).toBe("pending");
  });

  it("event purchase succeeded in full: flips to refunded with the confirmed amount", async () => {
    h.refundsCreate.mockResolvedValue({ id: "re_ev", status: "succeeded" });
    await issueStripeRefundAction({ kind: "event_purchase", id: "ep-1", amountCents: 9000, reason: "event cancelled" });
    expect(h.refundPurchase.mock.calls[0][1]).toMatchObject({ fullRefund: true, refundedAmountCents: 9000, refundStatus: "succeeded" });
  });
});

describe("reconcileStripeRefundUpdate — webhook resolves a pending refund", () => {
  const meta = { bpm_kind: "subscription", bpm_entity_id: "sub-1" };

  it("succeeded: adds the refund amount to the confirmed total and stamps the date", async () => {
    h.sub = stripeSub({ refundedAmountCents: 1000, refundStatus: "pending", stripeRefundId: "re_wait" });
    const r = await reconcileStripeRefundUpdate({ id: "re_wait", amount: 2000, status: "succeeded", metadata: meta });
    expect(r).toEqual({ handled: true });
    const patch = h.updateSubscription.mock.calls[0][1];
    expect(patch).toMatchObject({ refundStatus: "succeeded", refundedAmountCents: 3000 });
    expect(typeof patch.refundedAt).toBe("string");
    expect(patch.paymentStatus).toBeUndefined();
  });

  it("failed: marks failed, adds nothing", async () => {
    h.sub = stripeSub({ refundStatus: "pending", stripeRefundId: "re_wait" });
    await reconcileStripeRefundUpdate({ id: "re_wait", amount: 5500, status: "failed", metadata: meta });
    expect(h.updateSubscription.mock.calls[0][1]).toEqual({ stripeRefundId: "re_wait", refundStatus: "failed" });
  });

  it("ignores a refund the row is not waiting on, replays, still-pending updates and non-BPM refunds", async () => {
    h.sub = stripeSub({ refundStatus: "pending", stripeRefundId: "re_other" });
    expect(await reconcileStripeRefundUpdate({ id: "re_wait", amount: 1, status: "succeeded", metadata: meta })).toEqual({ handled: false });

    h.sub = stripeSub({ refundStatus: "succeeded", stripeRefundId: "re_wait", refundedAmountCents: 5500 });
    expect(await reconcileStripeRefundUpdate({ id: "re_wait", amount: 5500, status: "succeeded", metadata: meta })).toEqual({ handled: false });

    h.sub = stripeSub({ refundStatus: "pending", stripeRefundId: "re_wait" });
    expect(await reconcileStripeRefundUpdate({ id: "re_wait", amount: 1, status: "pending", metadata: meta })).toEqual({ handled: false });
    expect(await reconcileStripeRefundUpdate({ id: "re_wait", amount: 1, status: "succeeded", metadata: {} })).toEqual({ handled: false });

    expect(h.updateSubscription).not.toHaveBeenCalled();
  });
});
