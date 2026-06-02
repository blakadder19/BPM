import { describe, it, expect } from "vitest";
import {
  validateStripeRefundRequest,
  REFUND_ERROR_MESSAGES,
  type RefundableRecord,
} from "../stripe-refund-rules";

function record(over: Partial<RefundableRecord> = {}): RefundableRecord {
  return {
    paymentMethod: "stripe",
    paymentReference: "stripe:cs_test_123",
    paidAmountCents: 10_000,
    refundedAmountCents: 0,
    paymentStatus: "paid",
    currency: "eur",
    ...over,
  };
}

describe("validateStripeRefundRequest", () => {
  describe("Stripe payment method gate", () => {
    it("rejects non-Stripe payment methods (cash)", () => {
      const r = validateStripeRefundRequest(record({ paymentMethod: "cash" }), { amountCents: 1000, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe("NOT_STRIPE_PAYMENT");
        expect(r.message).toBe(REFUND_ERROR_MESSAGES.NOT_STRIPE_PAYMENT);
      }
    });

    it("rejects revolut", () => {
      const r = validateStripeRefundRequest(record({ paymentMethod: "revolut" }), { amountCents: 1000, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("NOT_STRIPE_PAYMENT");
    });

    it("rejects manual reception payments", () => {
      const r = validateStripeRefundRequest(record({ paymentMethod: "manual" }), { amountCents: 1000, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("NOT_STRIPE_PAYMENT");
    });

    it("rejects complimentary", () => {
      const r = validateStripeRefundRequest(record({ paymentMethod: "complimentary" }), { amountCents: 1000, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("NOT_STRIPE_PAYMENT");
    });
  });

  describe("Stripe reference gate", () => {
    it("rejects when payment_reference is null", () => {
      const r = validateStripeRefundRequest(record({ paymentReference: null }), { amountCents: 1000, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("MISSING_STRIPE_REFERENCE");
    });

    it("rejects when payment_reference has no stripe: prefix", () => {
      const r = validateStripeRefundRequest(record({ paymentReference: "cs_test_123" }), { amountCents: 1000, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("MISSING_STRIPE_REFERENCE");
    });

    it("rejects when stripe: prefix has no session id after it", () => {
      const r = validateStripeRefundRequest(record({ paymentReference: "stripe:" }), { amountCents: 1000, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("MISSING_STRIPE_REFERENCE");
    });

    it("extracts the session id correctly", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 1000, reason: "ok" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.stripeSessionId).toBe("cs_test_123");
    });
  });

  describe("Already-refunded guard", () => {
    it("rejects rows already marked refunded at the full amount", () => {
      const r = validateStripeRefundRequest(
        record({ paymentStatus: "refunded", refundedAmountCents: 10_000 }),
        { amountCents: 1000, reason: "x" },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("ALREADY_FULLY_REFUNDED");
    });

    it("rejects when cumulative refund already equals paid (status still paid)", () => {
      // Edge case — should never occur, but the guard protects against it.
      const r = validateStripeRefundRequest(
        record({ refundedAmountCents: 10_000 }),
        { amountCents: 1, reason: "x" },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("ALREADY_FULLY_REFUNDED");
    });

    it("allows another partial refund when there's remaining amount", () => {
      const r = validateStripeRefundRequest(
        record({ refundedAmountCents: 4_000 }),
        { amountCents: 3_000, reason: "second partial" },
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.newRefundedAmountCents).toBe(7_000);
        expect(r.fullRefund).toBe(false);
      }
    });
  });

  describe("Amount validation", () => {
    it("rejects zero", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 0, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("AMOUNT_INVALID");
    });

    it("rejects negative", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: -100, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("AMOUNT_INVALID");
    });

    it("rejects NaN", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: Number.NaN, reason: "x" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("AMOUNT_INVALID");
    });

    it("rejects amounts exceeding the remaining refundable", () => {
      const r = validateStripeRefundRequest(
        record({ refundedAmountCents: 6_000 }),
        { amountCents: 5_000, reason: "x" },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("AMOUNT_EXCEEDS_REMAINING");
    });

    it("accepts the exact remaining amount and marks fullRefund=true", () => {
      const r = validateStripeRefundRequest(
        record({ refundedAmountCents: 4_000 }),
        { amountCents: 6_000, reason: "final partial" },
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.fullRefund).toBe(true);
        expect(r.newRefundedAmountCents).toBe(10_000);
      }
    });

    it("rejects when paid amount is unknown (null)", () => {
      const r = validateStripeRefundRequest(
        record({ paidAmountCents: null }),
        { amountCents: 100, reason: "x" },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("PAID_AMOUNT_UNKNOWN");
    });

    it("rejects when paid amount is zero", () => {
      const r = validateStripeRefundRequest(
        record({ paidAmountCents: 0 }),
        { amountCents: 100, reason: "x" },
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("PAID_AMOUNT_UNKNOWN");
    });
  });

  describe("Reason requirement", () => {
    it("rejects empty reason", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 1000, reason: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("REASON_REQUIRED");
    });

    it("rejects whitespace-only reason", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 1000, reason: "   " });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("REASON_REQUIRED");
    });

    it("rejects null reason", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 1000, reason: null });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("REASON_REQUIRED");
    });

    it("trims the reason on success", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 1000, reason: "  customer requested   " });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.reason).toBe("customer requested");
    });
  });

  describe("Happy path", () => {
    it("accepts a full refund with valid inputs", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 10_000, reason: "customer cancelled" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.amountCents).toBe(10_000);
        expect(r.newRefundedAmountCents).toBe(10_000);
        expect(r.fullRefund).toBe(true);
        expect(r.stripeSessionId).toBe("cs_test_123");
      }
    });

    it("accepts a partial refund and reports fullRefund=false", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 2_500, reason: "partial credit" });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.fullRefund).toBe(false);
        expect(r.newRefundedAmountCents).toBe(2_500);
      }
    });

    it("floors fractional cent amounts", () => {
      const r = validateStripeRefundRequest(record(), { amountCents: 1234.7, reason: "x" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.amountCents).toBe(1234);
    });
  });
});
