import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { fulfillStripeCheckout } from "@/lib/actions/stripe-checkout";
import { fulfillExistingSubscriptionPayment } from "@/lib/actions/stripe-checkout";
import { fulfillEventPurchase, fulfillPendingEventPurchase, fulfillGuestEventPurchase } from "@/lib/actions/event-purchase";

/**
 * Stripe webhook endpoint.
 *
 * Handles checkout.session.completed for one-time payment fulfillment.
 * Verifies the webhook signature using STRIPE_WEBHOOK_SECRET.
 *
 * Setup: in Stripe Dashboard → Developers → Webhooks, add endpoint:
 *   URL:    https://<your-domain>/api/webhooks/stripe
 *   Events: checkout.session.completed
 *
 * For local dev: use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
 */
export async function POST(request: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      "[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — cannot verify events.",
    );
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    console.warn(
      "[stripe-webhook] Signature verification failed:",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 },
    );
  }

  // ── Handle events ──────────────────────────────────────────

  console.info(`[stripe-webhook] Received event type=${event.type} id=${event.id}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = (session.metadata ?? {}) as Record<string, string>;

    console.info(
      `[stripe-webhook] checkout.session.completed session=${session.id} payment_status=${session.payment_status} purchase_type=${metadata.bpm_purchase_type ?? "standard"}`,
    );

    if (session.payment_status !== "paid") {
      console.info(
        `[stripe-webhook] Session ${session.id} not yet paid (status=${session.payment_status}) — skipping fulfillment.`,
      );
      return NextResponse.json({ received: true });
    }

    // Guest event purchase — no student ID, uses guest fields
    if (metadata.bpm_purchase_type === "event_guest") {
      console.info(`[stripe-webhook] Routing to guest event fulfillment. event=${metadata.bpm_event_id} product=${metadata.bpm_event_product_id} guest=${metadata.bpm_guest_email}`);
      const result = await fulfillGuestEventPurchase(session.id, metadata);
      if (!result.success) {
        console.error(`[stripe-webhook] Guest fulfillment FAILED for session ${session.id}:`, result.error);
        return NextResponse.json({ error: "Fulfillment failed" }, { status: 500 });
      }
      console.info(`[stripe-webhook] Guest fulfillment SUCCEEDED for session ${session.id}`);
      return NextResponse.json({ received: true });
    }

    if (!metadata.bpm_student_id) {
      console.warn(
        `[stripe-webhook] Session ${session.id} has no bpm_student_id metadata — ignoring.`,
      );
      return NextResponse.json({ received: true });
    }

    let result: { success: boolean; error?: string };
    if (metadata.bpm_purchase_type === "event") {
      result = metadata.bpm_event_purchase_id
        ? await fulfillPendingEventPurchase(session.id, metadata)
        : await fulfillEventPurchase(session.id, metadata);
    } else if (metadata.bpm_mode === "pay_existing") {
      result = await fulfillExistingSubscriptionPayment(session.id, metadata);
    } else {
      result = await fulfillStripeCheckout(session.id, metadata);
    }
    if (!result.success) {
      console.error(
        `[stripe-webhook] Fulfillment failed for session ${session.id}:`,
        result.error,
      );
      return NextResponse.json(
        { error: "Fulfillment failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true });
}
