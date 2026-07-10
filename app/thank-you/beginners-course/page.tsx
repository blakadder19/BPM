import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ConversionTracker } from "@/components/analytics/conversion-tracker";
import {
  googleAdsSendTo,
  isMetaPixelConfigured,
} from "@/lib/analytics/tracking";

/**
 * Phase 8 — dedicated thank-you page for the beginners-course
 * registration funnel driven by Google Ads / Meta Ads landing pages.
 *
 * Public route, no auth required. Rendered only after a successful
 * registration form submission redirects the visitor here. Firing
 * conversions on this page is safe because normal navigation never
 * lands here.
 *
 * Events fired (only if the respective platform is configured):
 *   - Google Ads: `conversion` event with `send_to` built from
 *     NEXT_PUBLIC_GOOGLE_ADS_ID and
 *     NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGINNERS.
 *   - Meta Pixel: `Lead` (default for a free / lead-gen registration).
 *
 * Dedup: the ConversionTracker uses a sessionStorage key derived from
 * the pathname + Meta event name so a refresh cannot double-fire.
 */

export const metadata: Metadata = {
  title: "Thank you for registering — BPM",
  description:
    "We've received your registration. BPM will contact you with the next steps.",
  robots: { index: false, follow: false },
};

export default function BeginnersThankYouPage() {
  const googleSendTo = googleAdsSendTo("beginners");
  const metaEventName = isMetaPixelConfigured() ? "Lead" : null;

  return (
    <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-gray-900">
            Thank you for registering!
          </h1>
          <p className="mt-3 max-w-sm text-sm text-gray-600">
            We&apos;ve received your registration. BPM will contact you with
            the next steps.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-500"
            >
              Back to home
            </Link>
            <Link
              href="/classes"
              className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View classes
            </Link>
          </div>
        </CardContent>
      </Card>

      <ConversionTracker
        googleSendTo={googleSendTo}
        metaEventName={metaEventName}
        dedupEventName="beginners_registration"
      />
    </div>
  );
}
