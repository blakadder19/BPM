import Link from "next/link";
import { XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Stripe Checkout cancel/abandoned redirect page.
 *
 * The student lands here when they cancel or abandon the Stripe Checkout page.
 * No subscription is created — they can try again from the catalog.
 */
export default function CheckoutCancelPage() {
  return (
    <div className="mx-auto max-w-md py-16 px-4">
      <Card>
        <CardContent className="flex flex-col items-center py-12">
          <XCircle className="h-12 w-12 text-gray-400" />
          <h1 className="mt-4 text-lg font-semibold text-gray-900">
            Payment cancelled
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            No payment was made and no plan was activated. You can try again
            whenever you&apos;re ready, or pay at reception instead.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/catalog"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Back to catalog
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Go to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
