/**
 * Canonical app base URL for use in email templates, shareable links,
 * and any server-side context where the request headers are unavailable.
 *
 * For request-aware URL resolution (e.g. Stripe success/cancel URLs),
 * prefer the `resolveAppUrl()` helper in stripe-checkout.ts instead.
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://book.balancepowermotion.com";
}
