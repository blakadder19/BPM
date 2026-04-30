import "server-only";

/**
 * Shared Stripe checkout fulfillment router.
 *
 * Both the Stripe webhook and the `/checkout/success` reconciliation
 * page route through this single function so the persisted result is
 * identical regardless of which path actually fulfills the session.
 *
 * Idempotency lives inside the individual fulfillment helpers (they
 * check by `paymentReference = stripe:<sessionId>` before writing). A
 * webhook + success-page race is therefore safe — whichever runs
 * second is a no-op.
 *
 * Source-of-truth invariant:
 *   BPM calculates, Stripe charges, this router persists the frozen
 *   result that was committed at session creation. No re-pricing.
 */

import {
  fulfillStripeCheckout,
  fulfillExistingSubscriptionPayment,
} from "@/lib/actions/stripe-checkout";
import {
  fulfillEventPurchase,
  fulfillPendingEventPurchase,
  fulfillGuestEventPurchase,
} from "@/lib/actions/event-purchase";

export type FulfillmentSource = "webhook" | "success_page";

export interface FulfillmentRouterResult {
  success: boolean;
  error?: string;
  /** Which fulfillment helper handled the session, for logging. */
  branch?:
    | "guest_event"
    | "event_pending"
    | "event"
    | "pay_existing"
    | "subscription"
    | "ignored";
}

/**
 * Dispatch to the correct fulfillment helper based on Stripe session
 * metadata. Caller is responsible for passing only sessions whose
 * `payment_status === 'paid'` — guard happens in webhook /
 * reconciliation, NOT here.
 */
export async function routeStripeSessionFulfillment(
  sessionId: string,
  metadata: Record<string, string>,
  source: FulfillmentSource,
): Promise<FulfillmentRouterResult> {
  // Guest event purchase — no student id, uses guest_* metadata fields.
  if (metadata.bpm_purchase_type === "event_guest") {
    console.info(
      `[stripe-fulfill:${source}] guest_event session=${sessionId} event=${metadata.bpm_event_id} product=${metadata.bpm_event_product_id} guest=${metadata.bpm_guest_email}`,
    );
    const r = await fulfillGuestEventPurchase(sessionId, metadata);
    return { ...r, branch: "guest_event" };
  }

  if (!metadata.bpm_student_id) {
    console.warn(
      `[stripe-fulfill:${source}] session=${sessionId} has no bpm_student_id metadata — ignoring.`,
    );
    return { success: true, branch: "ignored" };
  }

  if (metadata.bpm_purchase_type === "event") {
    if (metadata.bpm_event_purchase_id) {
      console.info(
        `[stripe-fulfill:${source}] event_pending session=${sessionId} purchase=${metadata.bpm_event_purchase_id}`,
      );
      const r = await fulfillPendingEventPurchase(sessionId, metadata);
      return { ...r, branch: "event_pending" };
    }
    console.info(`[stripe-fulfill:${source}] event session=${sessionId}`);
    const r = await fulfillEventPurchase(sessionId, metadata);
    return { ...r, branch: "event" };
  }

  if (metadata.bpm_mode === "pay_existing") {
    console.info(
      `[stripe-fulfill:${source}] pay_existing session=${sessionId} subscription=${metadata.bpm_subscription_id}`,
    );
    const r = await fulfillExistingSubscriptionPayment(sessionId, metadata);
    return { ...r, branch: "pay_existing" };
  }

  console.info(
    `[stripe-fulfill:${source}] subscription session=${sessionId} product=${metadata.bpm_product_id}`,
  );
  const r = await fulfillStripeCheckout(sessionId, metadata);
  return { ...r, branch: "subscription" };
}
