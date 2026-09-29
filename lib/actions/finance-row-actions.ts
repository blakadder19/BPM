"use server";

/**
 * Lightweight wrapper actions invoked directly from the Finance table
 * (Bug 5). Only "mark as paid" is exposed for now — refunds and
 * cancellations remain on their existing surfaces (student detail,
 * event admin) where context-rich confirmations live.
 *
 * Routes by FinanceTransaction.id prefix:
 *   sub-{id}  → subscription path: applyPaymentChangeAction
 *   evt-{id}  → event purchase path: markEventPurchasePaidAction
 *   pen-{id}  → not supported (penalties have their own resolution)
 *
 * Reuses existing server actions verbatim so audit logging, claim
 * preservation, and discount-snapshot integrity are inherited.
 */

import { requirePermissionForAction } from "@/lib/staff-permissions";
import { applyPaymentChangeAction } from "./subscriptions";
import { markEventPurchasePaidAction } from "./event-purchase";
import { getSpecialEventRepo, getSubscriptionRepo } from "@/lib/repositories";

export interface MarkFinanceTransactionPaidInput {
  transactionId: string;
  /**
   * Optional reception method. If omitted, defaults to "cash" — admins
   * can refine later via the dedicated event/subscription panels.
   */
  receptionMethod?: "cash" | "revolut";
}

export async function markFinanceTransactionPaidAction(
  input: MarkFinanceTransactionPaidInput,
): Promise<{ success: boolean; error?: string }> {
  // Either finance:mark_paid or payments:mark_paid_reception unlocks
  // this — front-desk staff typically have the latter, finance staff
  // typically have the former, super_admin always passes.
  const guard = await requirePermissionForAction("finance:mark_paid");
  if (!guard.ok) {
    const altGuard = await requirePermissionForAction(
      "payments:mark_paid_reception",
    );
    if (!altGuard.ok) return { success: false, error: guard.error };
  }

  const { transactionId } = input;
  if (!transactionId) {
    return { success: false, error: "Missing transaction id." };
  }

  if (transactionId.startsWith("sub-")) {
    const subscriptionId = transactionId.slice("sub-".length);
    const sub = await getSubscriptionRepo().getById(subscriptionId);
    if (!sub) return { success: false, error: "Subscription not found." };
    if (sub.paymentStatus !== "pending") {
      return { success: false, error: `Cannot mark as paid: status is ${sub.paymentStatus}.` };
    }
    return applyPaymentChangeAction({
      subscriptionId,
      newPaymentStatus: "paid",
      cancelEntitlement: false,
    });
  }

  if (transactionId.startsWith("evt-")) {
    const purchaseId = transactionId.slice("evt-".length);
    const repo = getSpecialEventRepo();
    const [purchase, events] = await Promise.all([
      repo.getPurchaseById(purchaseId),
      repo.getAllEvents(),
    ]);
    // Only accept a purchase whose event still exists — the same set the
    // previous per-event scan could find it in.
    const eventId =
      purchase && events.some((e) => e.id === purchase.eventId) ? purchase.eventId : null;
    if (!eventId) return { success: false, error: "Event purchase not found." };
    return markEventPurchasePaidAction({
      purchaseId,
      eventId,
      receptionMethod: input.receptionMethod ?? "cash",
    });
  }

  return { success: false, error: "This row type cannot be marked as paid from finance." };
}
