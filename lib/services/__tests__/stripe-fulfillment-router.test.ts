/**
 * The fulfilment router is the single choke point for Stripe-paid
 * fulfilment. It must refuse any session Stripe has not marked paid,
 * regardless of what the metadata claims.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { calls, ok } = vi.hoisted(() => {
  const calls: string[] = [];
  const ok = (name: string) => async () => {
    calls.push(name);
    return { success: true };
  };
  return { calls, ok };
});

vi.mock("@/lib/services/stripe-fulfillment", () => ({
  fulfillStripeCheckout: ok("subscription"),
  fulfillExistingSubscriptionPayment: ok("pay_existing"),
}));
vi.mock("@/lib/services/event-purchase-fulfillment", () => ({
  fulfillEventPurchase: ok("event"),
  fulfillPendingEventPurchase: ok("event_pending"),
  fulfillGuestEventPurchase: ok("guest_event"),
}));

import { routeStripeSessionFulfillment } from "../stripe-fulfillment-router";

const session = (payment_status: string, metadata: Record<string, string>) =>
  ({ id: "cs_test_1", payment_status, metadata }) as Parameters<
    typeof routeStripeSessionFulfillment
  >[0];

beforeEach(() => {
  calls.length = 0;
});

describe("routeStripeSessionFulfillment", () => {
  it.each(["unpaid", "no_payment_required", "", "PAID"])(
    "refuses payment_status=%p",
    async (status) => {
      const r = await routeStripeSessionFulfillment(
        session(status, { bpm_student_id: "s-1", bpm_product_id: "p-1", bpm_valid_from: "2026-10-01" }),
        "success_page",
      );
      expect(r.success).toBe(false);
      expect(r.branch).toBe("not_paid");
      expect(calls).toEqual([]);
    },
  );

  it("refuses an unpaid guest event session even with complete metadata", async () => {
    const r = await routeStripeSessionFulfillment(
      session("unpaid", { bpm_purchase_type: "event_guest", bpm_event_id: "e", bpm_event_product_id: "p", bpm_guest_email: "g@example.test" }),
      "webhook",
    );
    expect(r.success).toBe(false);
    expect(calls).toEqual([]);
  });

  it.each([
    [{ bpm_purchase_type: "event_guest" }, "guest_event"],
    [{ bpm_student_id: "s", bpm_purchase_type: "event", bpm_event_purchase_id: "ep" }, "event_pending"],
    [{ bpm_student_id: "s", bpm_purchase_type: "event" }, "event"],
    [{ bpm_student_id: "s", bpm_mode: "pay_existing" }, "pay_existing"],
    [{ bpm_student_id: "s" }, "subscription"],
  ])("routes a paid session with %o to %s", async (metadata, branch) => {
    const r = await routeStripeSessionFulfillment(session("paid", metadata), "webhook");
    expect(r.success).toBe(true);
    expect(r.branch).toBe(branch);
    expect(calls).toEqual([branch]);
  });

  it("ignores paid sessions without BPM metadata", async () => {
    const r = await routeStripeSessionFulfillment(session("paid", {}), "webhook");
    expect(r.branch).toBe("ignored");
    expect(calls).toEqual([]);
  });
});
