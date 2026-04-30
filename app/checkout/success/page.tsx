import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth";
import { reconcileStripeSessionAction } from "@/lib/actions/stripe-reconcile";

/**
 * Stripe Checkout success redirect page.
 *
 * This is a PUBLIC route — no auth required to render.
 * Students land here after completing a Stripe Checkout payment.
 *
 * Fulfillment normally happens in the webhook
 * (`/api/webhooks/stripe`). But Vercel previews / fresh environments
 * frequently lack a configured webhook endpoint, which would leave
 * the student paid-but-unprovisioned. To make checkout end-to-end
 * reliable in every environment, we also reconcile the session here:
 * we ask Stripe whether the session was actually paid, then route
 * through the same fulfillment helpers the webhook uses. Idempotency
 * lives inside those helpers (paymentReference de-dup on
 * `stripe:<sessionId>`), so webhook + success-page is a safe race.
 *
 * If reconciliation fails for any reason we still render the
 * informational success page — Stripe already charged the student,
 * and a subsequent webhook delivery (or admin-side replay) will
 * fulfill on its own. We surface a soft "your plan is being set up"
 * note in that case.
 */
type SP = Promise<{ session_id?: string }> | { session_id?: string };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams?: SP;
}) {
  const sp = (await searchParams) ?? {};
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;

  const user = await getAuthUser();
  const isStudent = user?.role === "student";

  let reconciled: Awaited<ReturnType<typeof reconcileStripeSessionAction>> | null = null;
  if (sessionId) {
    try {
      reconciled = await reconcileStripeSessionAction(sessionId);
    } catch (err) {
      console.warn(
        "[checkout-success] reconcile threw:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const fulfillmentLikelyComplete =
    reconciled?.success && reconciled.paid === true;
  const stillProvisioning =
    !reconciled || (reconciled && !reconciled.paid) || (reconciled && reconciled.paid && !reconciled.success);

  return (
    <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="flex flex-col items-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <h1 className="mt-4 font-display text-lg font-semibold text-gray-900">
            Payment received
          </h1>
          {fulfillmentLikelyComplete ? (
            <p className="mt-2 text-center text-sm text-gray-500">
              Your payment was successful and your plan has been activated.
            </p>
          ) : (
            <p className="mt-2 text-center text-sm text-gray-500">
              Your payment was successful. Your plan will be activated shortly — it
              may take a few moments to appear on your dashboard.
            </p>
          )}
          {stillProvisioning && reconciled?.error && process.env.NODE_ENV === "development" && (
            <p className="mt-2 text-center text-xs text-amber-700">
              Reconcile note (dev only): {reconciled.error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {isStudent ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-500"
              >
                Go to dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-500"
              >
                Log in to your dashboard
              </Link>
            )}
            <Link
              href={isStudent ? "/catalog" : "/login"}
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {isStudent ? "Back to catalog" : "Back to BPM"}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
