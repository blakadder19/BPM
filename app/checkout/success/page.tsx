import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Stripe Checkout success redirect page.
 *
 * This is a PUBLIC route — no auth required.
 * Students land here after completing a Stripe Checkout payment.
 * Actual subscription activation is handled by the webhook — this page
 * is purely informational.
 */
export default function CheckoutSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-12">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <h1 className="mt-4 text-lg font-semibold text-gray-900">
            Payment received
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Your payment was successful. Your plan will be activated shortly — it
            may take a few moments to appear on your dashboard.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Go to dashboard
            </Link>
            <Link
              href="/catalog"
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to catalog
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
