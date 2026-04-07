import "server-only";

import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazily-initialized Stripe client.
 * Throws if STRIPE_SECRET_KEY is missing — callers should guard with isStripeEnabled().
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured. Set it in your environment variables.",
      );
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function isStripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
