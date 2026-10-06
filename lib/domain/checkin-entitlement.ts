/**
 * Rules for using a pass at check-in, shared by every check-in path
 * (QR booking / walk-in, token, student self check-in, admin booking
 * check-in, Attendance-page marks) and by the UIs that offer them.
 */
import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import type { BookingSource, ClassType, SalePaymentStatus } from "@/types/domain";
import type { MockSubscription } from "@/lib/mock-data";

export const PAYMENT_NOT_CONFIRMED = "Payment must be confirmed before check-in.";

const PAYMENT_SATISFIED: ReadonlySet<string> = new Set<SalePaymentStatus>(["paid", "complimentary", "waived"]);

/** Paid, Complimentary and Waived passes can be used; Pending (and anything else) cannot. */
export function paymentAllowsCheckIn(status: SalePaymentStatus | string | null | undefined): boolean {
  return !!status && PAYMENT_SATISFIED.has(status);
}

/** Whether attending this class type is paid for with a pass (configured per class type). */
export function classNeedsEntitlement(classType: ClassType): boolean {
  return CLASS_TYPE_CONFIG[classType]?.creditsApply ?? true;
}

/**
 * Whether the booking already took a credit from its pass. Mirrors the
 * cancellation refund: every booking with a pass except a birthday booking.
 */
export function bookingHoldsCredit(booking: { subscriptionId: string | null; source?: BookingSource | null }): boolean {
  return !!booking.subscriptionId && booking.source !== "birthday";
}

type CreditFields = Pick<MockSubscription, "productType" | "status" | "classesUsed" | "classesPerTerm" | "remainingCredits">;

/**
 * The pass as it stood before this booking took its credit, so re-checking
 * it at check-in does not count that credit against it a second time
 * (e.g. a one-class drop-in booked yesterday is now at 0 / exhausted).
 */
export function withBookedCreditReturned<T extends CreditFields>(sub: T): T {
  if (sub.productType === "membership" && sub.classesPerTerm !== null) {
    return { ...sub, classesUsed: Math.max(0, sub.classesUsed - 1) };
  }
  if (sub.remainingCredits !== null) {
    return {
      ...sub,
      remainingCredits: sub.remainingCredits + 1,
      status: sub.status === "exhausted" ? "active" : sub.status,
    };
  }
  return sub;
}
