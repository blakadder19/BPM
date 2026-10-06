/**
 * Which payment status and method staff may set when assigning a pass /
 * membership (`students:assign_subscription`).
 *
 * Assigning grants the entitlement only. Anything beyond "pending" is a
 * payment decision and needs its own permission:
 *
 *   - pending                → nothing extra
 *   - paid                   → payments:mark_paid_reception (money collected)
 *   - complimentary / waived → payments:grant_complimentary (given away)
 *
 * A new pass can never start out cancelled or refunded; those happen to
 * existing subscriptions through their own flows. Manual discounts are a
 * separate `payments:manual_adjustment` check.
 *
 * Method follows status: a free pass is always recorded with the
 * "complimentary" method, and a pending or paid one never is, so Finance
 * cannot show collected revenue paid "complimentary".
 *
 * Shared by `createSubscriptionAction` and the assign dialog. Pure.
 */
import type { PaymentMethod, SalePaymentStatus } from "@/types/domain";
import type { Permission } from "./permissions";

export const ASSIGN_PAYMENT_STATUSES = ["paid", "pending", "complimentary", "waived"] as const;
export type AssignPaymentStatus = (typeof ASSIGN_PAYMENT_STATUSES)[number];

/** Used when the form omits the status. Never a paid entitlement. */
export const DEFAULT_ASSIGN_PAYMENT_STATUS: AssignPaymentStatus = "pending";

const REQUIRED: Record<AssignPaymentStatus, Permission | null> = {
  pending: null,
  paid: "payments:mark_paid_reception",
  complimentary: "payments:grant_complimentary",
  waived: "payments:grant_complimentary",
};

function isAssignStatus(status: string): status is AssignPaymentStatus {
  return (ASSIGN_PAYMENT_STATUSES as readonly string[]).includes(status);
}

export function isFreeAssignStatus(status: string): boolean {
  return status === "complimentary" || status === "waived";
}

export function assignPaymentStatusDenial(
  status: SalePaymentStatus | string,
  has: (permission: Permission) => boolean,
): string | null {
  if (!isAssignStatus(status)) {
    return status === "cancelled" || status === "refunded"
      ? `A new pass cannot be created as ${status}.`
      : "Invalid payment status";
  }
  const required = REQUIRED[status];
  if (required === null || has(required)) return null;
  return `Assigning a pass as ${status} requires the ${required} permission. Assign it as pending instead.`;
}

export function allowedAssignPaymentStatuses(
  has: (permission: Permission) => boolean,
): AssignPaymentStatus[] {
  return ASSIGN_PAYMENT_STATUSES.filter((s) => assignPaymentStatusDenial(s, has) === null);
}

/**
 * The method to store for a new pass, or an error. Free passes are
 * normalized to "complimentary" whatever was submitted.
 */
export function resolveAssignPaymentMethod(
  status: AssignPaymentStatus,
  method: PaymentMethod,
): { ok: true; method: PaymentMethod } | { ok: false; error: string } {
  if (isFreeAssignStatus(status)) return { ok: true, method: "complimentary" };
  if (method === "complimentary") {
    return { ok: false, error: `A ${status} pass cannot use the Complimentary payment method.` };
  }
  return { ok: true, method };
}
