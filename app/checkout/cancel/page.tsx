import Link from "next/link";
import { XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getAuthUser } from "@/lib/auth";

/**
 * Stripe Checkout cancel/abandoned redirect page.
 *
 * This is a PUBLIC route — no auth required to render.
 * Students land here when they cancel or abandon the Stripe Checkout page.
 * No subscription is created — they can try again from the catalog.
 *
 * The page optionally reads the session to render role-appropriate CTAs.
 */
export default async function CheckoutCancelPage() {
  const user = await getAuthUser();
  const isStudent = user?.role === "student";

  return (
    <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="flex flex-col items-center py-12">
          <XCircle className="h-12 w-12 text-gray-400" />
          <h1 className="mt-4 font-display text-lg font-semibold text-gray-900">
            Payment cancelled
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            No payment was made and no plan was activated. You can try again
            whenever you&apos;re ready, or pay at reception instead.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {isStudent ? (
              <Link
                href="/catalog"
                className="inline-flex items-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-500"
              >
                Back to catalog
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-500"
              >
                Log in to continue
              </Link>
            )}
            {isStudent && (
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Go to dashboard
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
