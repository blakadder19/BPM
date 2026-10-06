import { describe, expect, it } from "vitest";
import {
  ASSIGN_PAYMENT_STATUSES,
  DEFAULT_ASSIGN_PAYMENT_STATUS,
  allowedAssignPaymentStatuses,
  assignPaymentStatusDenial,
  isFreeAssignStatus,
  resolveAssignPaymentMethod,
} from "../assign-payment-status";
import { PERMISSION_KEYS, type Permission } from "../permissions";
import type { PaymentMethod } from "@/types/domain";

const holding = (...keys: Permission[]) => (p: Permission) => keys.includes(p);

describe("assign payment status", () => {
  it("defaults to pending", () => {
    expect(DEFAULT_ASSIGN_PAYMENT_STATUS).toBe("pending");
  });

  it("with no payment permission only pending is allowed", () => {
    expect(allowedAssignPaymentStatuses(holding())).toEqual(["pending"]);
    expect(assignPaymentStatusDenial("paid", holding())).toMatch(/payments:mark_paid_reception.*pending instead/);
    expect(assignPaymentStatusDenial("complimentary", holding())).toMatch(/payments:grant_complimentary/);
    expect(assignPaymentStatusDenial("waived", holding())).toMatch(/payments:grant_complimentary/);
  });

  it("mark_paid_reception adds paid only", () => {
    expect(allowedAssignPaymentStatuses(holding("payments:mark_paid_reception"))).toEqual(["paid", "pending"]);
  });

  it("grant_complimentary adds complimentary and waived, not paid", () => {
    expect(allowedAssignPaymentStatuses(holding("payments:grant_complimentary"))).toEqual(["pending", "complimentary", "waived"]);
    expect(assignPaymentStatusDenial("complimentary", holding("payments:grant_complimentary"))).toBeNull();
    expect(assignPaymentStatusDenial("waived", holding("payments:grant_complimentary"))).toBeNull();
  });

  it("manual_adjustment no longer stands in for grant_complimentary", () => {
    expect(allowedAssignPaymentStatuses(holding("payments:manual_adjustment"))).toEqual(["pending"]);
  });

  it("finance permissions do not stand in for either", () => {
    expect(allowedAssignPaymentStatuses(holding("finance:mark_paid", "finance:refund", "payments:refund"))).toEqual(["pending"]);
  });

  it("cancelled and refunded are never valid at creation, whatever is held", () => {
    const everything = holding(...PERMISSION_KEYS);
    for (const status of ["cancelled", "refunded"]) {
      expect(assignPaymentStatusDenial(status, everything)).toMatch(/cannot be created as/);
    }
    expect(allowedAssignPaymentStatuses(everything)).toEqual([...ASSIGN_PAYMENT_STATUSES]);
    expect(ASSIGN_PAYMENT_STATUSES).not.toContain("cancelled");
    expect(ASSIGN_PAYMENT_STATUSES).not.toContain("refunded");
  });

  it("unknown statuses are rejected", () => {
    expect(assignPaymentStatusDenial("free", () => true)).toBe("Invalid payment status");
  });
});

describe("assign payment method", () => {
  const NORMAL: PaymentMethod[] = ["cash", "card", "revolut", "bank_transfer", "manual", "stripe"];

  it("complimentary and waived always store the Complimentary method", () => {
    for (const status of ["complimentary", "waived"] as const) {
      expect(isFreeAssignStatus(status)).toBe(true);
      for (const method of [...NORMAL, "complimentary" as const]) {
        expect(resolveAssignPaymentMethod(status, method)).toEqual({ ok: true, method: "complimentary" });
      }
    }
  });

  it("paid and pending keep a normal method", () => {
    for (const status of ["paid", "pending"] as const) {
      expect(isFreeAssignStatus(status)).toBe(false);
      for (const method of NORMAL) {
        expect(resolveAssignPaymentMethod(status, method)).toEqual({ ok: true, method });
      }
    }
  });

  it("paid and pending cannot use the Complimentary method", () => {
    for (const status of ["paid", "pending"] as const) {
      const res = resolveAssignPaymentMethod(status, "complimentary");
      expect(res.ok).toBe(false);
      expect(!res.ok && res.error).toBe(`A ${status} pass cannot use the Complimentary payment method.`);
    }
  });
});
