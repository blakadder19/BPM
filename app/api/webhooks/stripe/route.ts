import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { fulfillStripeCheckout } from "@/lib/actions/stripe-checkout";
import { fulfillExistingSubscriptionPayment } from "@/lib/actions/stripe-checkout";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== "paid") {
      console.info(
        `[stripe-webhook] Session ${session.id} completed but payment_status=${session.payment_status} — skipping.`,
      );
      return NextResponse.json({ received: true });
    }

    const metadata = (session.metadata ?? {}) as Record<string, string>;

    if (!metadata.bpm_student_id) {
      console.warn(
        `[stripe-webhook] Session ${session.id} has no bpm_student_id metadata — ignoring.`,
      );
      return NextResponse.json({ received: true });
    }

    const result = metadata.bpm_mode === "pay_existing"
      ? await fulfillExistingSubscriptionPayment(session.id, metadata)
      : await fulfillStripeCheckout(session.id, metadata);
    if (!result.success) {
      console.error(
        `[stripe-webhook] Fulfillment failed for session ${session.id}:`,
        result.error,
      );
    } else {
      console.info(
        `[stripe-webhook] Fulfilled session ${session.id} for student ${metadata.bpm_student_id}.`,
      );
    }
  }

  return NextResponse.json({ received: true });
}
