"use server";

/**
 * Stripe checkout success-page reconciliation.
 *
 * Why this exists:
 *   The webhook is the primary fulfillment path. But on Vercel
 *   previews / fresh environments the webhook endpoint is often
 *   misconfigured or delayed, which leaves the student staring at a
 *   "Payment received" screen with no subscription written. Worse,
 *   the first-time discount claim is already consumed at session
 *   creation — losing the fulfillment turns it into a permanent
 *   waste.
 *
 * What it does:
 *   When the success page loads, it asks Stripe directly whether the
 *   session was actually paid, then routes to the same fulfillment
 *   helpers the webhook uses. Idempotency lives inside those helpers
 *   (`paymentReference = stripe:<sessionId>` checks), so a webhook +
 *   success-page race is safe — whichever runs second short-circuits.
 *
 * Source-of-truth invariant:
 *   This MUST NOT introduce a parallel pricing path. It only retrieves
 *   the existing session from Stripe, verifies payment_status, and
 *   hands metadata to the existing fulfillment helpers. Pricing was
 *   frozen at session creation and lives in the metadata snapshot.
 */

import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { routeStripeSessionFulfillment } from "@/lib/services/stripe-fulfillment-router";

export interface ReconcileResult {
  success: boolean;
  error?: string;
  /** True when the session is already paid — fulfillment was attempted. */
  paid?: boolean;
  /** Where the session is in Stripe's payment lifecycle. */
  paymentStatus?: string;
  branch?: string;
}

export async function reconcileStripeSessionAction(
  sessionId: string,
): Promise<ReconcileResult> {
  if (!isStripeEnabled()) {
    return { success: false, error: "Stripe is not configured." };
  }
  if (!sessionId || typeof sessionId !== "string") {
    return { success: false, error: "Missing session id." };
  }

  let session: import("stripe").Stripe.Checkout.Session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[stripe-reconcile] retrieve(${sessionId}) failed: ${msg}`,
    );
    return { success: false, error: msg };
  }

  if (session.payment_status !== "paid") {
    return {
      success: true,
      paid: false,
      paymentStatus: session.payment_status ?? "unknown",
    };
  }

  const metadata = (session.metadata ?? {}) as Record<string, string>;
  const result = await routeStripeSessionFulfillment(
    session.id,
    metadata,
    "success_page",
  );

  if (!result.success) {
    console.error(
      `[stripe-reconcile] Fulfillment failed for session ${sessionId}:`,
      result.error,
    );
  }

  return {
    success: result.success,
    error: result.error,
    paid: true,
    paymentStatus: session.payment_status,
    branch: result.branch,
  };
}
