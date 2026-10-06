import { describe, expect, it } from "vitest";
import {
  PAYMENT_NOT_CONFIRMED,
  bookingHoldsCredit,
  classNeedsEntitlement,
  paymentAllowsCheckIn,
  withBookedCreditReturned,
} from "../checkin-entitlement";

describe("check-in entitlement rules", () => {
  it("only paid, complimentary and waived passes can be used", () => {
    for (const s of ["paid", "complimentary", "waived"]) expect(paymentAllowsCheckIn(s)).toBe(true);
    for (const s of ["pending", "cancelled", "refunded", "", null, undefined, "PAID"]) expect(paymentAllowsCheckIn(s)).toBe(false);
    expect(PAYMENT_NOT_CONFIRMED).toBe("Payment must be confirmed before check-in.");
  });

  it("classes need a pass; socials and student practice do not", () => {
    expect(classNeedsEntitlement("class")).toBe(true);
    expect(classNeedsEntitlement("social")).toBe(false);
    expect(classNeedsEntitlement("student_practice")).toBe(false);
  });

  it("every booking with a pass holds its credit except a birthday booking", () => {
    for (const source of ["subscription", "waitlist_promotion", "admin", "drop_in", "admin_backdated"] as const) {
      expect(bookingHoldsCredit({ subscriptionId: "sub-1", source })).toBe(true);
    }
    expect(bookingHoldsCredit({ subscriptionId: "sub-1", source: "birthday" })).toBe(false);
    expect(bookingHoldsCredit({ subscriptionId: null, source: "subscription" })).toBe(false);
  });

  it("returns the booking's credit on a credit pass, reactivating one it exhausted", () => {
    const base = { productType: "drop_in" as const, classesUsed: 0, classesPerTerm: null };
    expect(withBookedCreditReturned({ ...base, status: "exhausted" as const, remainingCredits: 0 })).toEqual({
      ...base, status: "active", remainingCredits: 1,
    });
    expect(withBookedCreditReturned({ ...base, status: "expired" as const, remainingCredits: 2 })).toEqual({
      ...base, status: "expired", remainingCredits: 3,
    });
  });

  it("returns the booking's class on a class-counted membership", () => {
    const m = { productType: "membership" as const, status: "active" as const, classesUsed: 8, classesPerTerm: 8, remainingCredits: null };
    expect(withBookedCreditReturned(m)).toEqual({ ...m, classesUsed: 7 });
    expect(withBookedCreditReturned({ ...m, classesUsed: 0 })).toEqual({ ...m, classesUsed: 0 });
  });

  it("leaves an unlimited pass unchanged", () => {
    const u = { productType: "membership" as const, status: "active" as const, classesUsed: 3, classesPerTerm: null, remainingCredits: null };
    expect(withBookedCreditReturned(u)).toEqual(u);
  });
});
