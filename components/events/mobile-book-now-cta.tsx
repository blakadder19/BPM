"use client";

/**
 * Phase 12 — mobile-first Book-now CTAs for the public event landing.
 *
 * Two mount points on the same page:
 *   1. `HeroBookNowButton`   — an above-the-fold button inside the
 *                              compact mobile summary. Visible on
 *                              small screens only.
 *   2. `StickyBookNowBar`    — a fixed bottom bar with the primary
 *                              CTA + "No account needed" secondary
 *                              copy. Visible on small screens only.
 *
 * Both share the same click handler + tracking so ad managers get one
 * consistent `event_book_now_click` signal, differentiated only by
 * `cta_location`. See `lib/analytics/event-cta.ts` for the fire
 * semantics + rapid-click dedup.
 *
 * Neither component owns any state — the parent scrolls to the
 * booking section and toggles the guest form via `onClick`. Keeps
 * these two pieces stateless and easy to unit-test.
 */

import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  fireBookNowClick,
  type BookNowCtaLocation,
} from "@/lib/analytics/event-cta";

interface BaseProps {
  eventId: string;
  eventName?: string | null;
  /** Cheapest ticket in minor units. Null hides the price on the CTA. */
  fromPriceCents?: number | null;
  /** True when all tickets share the same price ("€XX" vs "from €XX"). */
  allSamePrice?: boolean;
  /**
   * Invoked after tracking. Parent scrolls to `#book-tickets` and
   * signals the `GuestPurchaseSection` to open the guest form.
   */
  onBookNow: () => void;
  /** Disable the button (e.g. no purchasable tickets). */
  disabled?: boolean;
}

function centsToEuros(c: number): string {
  return `€${(c / 100).toFixed(0)}`;
}

function buildCtaLabel({
  fromPriceCents,
  allSamePrice,
}: {
  fromPriceCents?: number | null;
  allSamePrice?: boolean;
}): string {
  if (typeof fromPriceCents !== "number" || !Number.isFinite(fromPriceCents)) {
    return "Book now";
  }
  const price = centsToEuros(fromPriceCents);
  if (allSamePrice) return `Book now · ${price}`;
  return `Book your spot · from ${price}`;
}

/**
 * Above-the-fold CTA embedded in the mobile summary card. Not visible
 * on `md+` screens where the full ticket grid + guest form are
 * already above the fold.
 */
export function HeroBookNowButton({
  eventId,
  eventName,
  fromPriceCents = null,
  allSamePrice = false,
  onBookNow,
  disabled,
}: BaseProps) {
  const label = buildCtaLabel({ fromPriceCents, allSamePrice });
  const location: BookNowCtaLocation = "hero";

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        fireBookNowClick({
          eventId,
          eventName,
          fromPriceCents,
          ctaLocation: location,
        });
        onBookNow();
      }}
      disabled={disabled}
      // Data attributes let ad managers wire GTM triggers on the
      // button click DOM event too, without needing the JS fire.
      data-tracking-event="event_book_now_click"
      data-event-id={eventId}
      data-event-name={eventName ?? undefined}
      data-cta-location={location}
      aria-label={`${label} — no account needed`}
      className="md:hidden w-full inline-flex items-center justify-center gap-2 rounded-lg bg-bpm-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-bpm-700 active:bg-bpm-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

/**
 * Sticky bottom CTA. Always in view on mobile; hidden on `md+`.
 * Positioned above device safe-area bottom insets (iOS home bar).
 */
export function StickyBookNowBar({
  eventId,
  eventName,
  fromPriceCents = null,
  allSamePrice = false,
  onBookNow,
  disabled,
}: BaseProps) {
  const label = buildCtaLabel({ fromPriceCents, allSamePrice });
  const location: BookNowCtaLocation = "sticky";

  return (
    <div
      // Reserve `md:hidden` so desktop layout is untouched. `pb`
      // uses `env(safe-area-inset-bottom)` via a Tailwind arbitrary
      // value so iOS PWA-in-browser doesn't overlap the home bar.
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      role="region"
      aria-label="Book this event"
    >
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          fireBookNowClick({
            eventId,
            eventName,
            fromPriceCents,
            ctaLocation: location,
          });
          onBookNow();
        }}
        disabled={disabled}
        data-tracking-event="event_book_now_click"
        data-event-id={eventId}
        data-event-name={eventName ?? undefined}
        data-cta-location={location}
        aria-label={`${label} — no account needed`}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-bpm-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-bpm-700 active:bg-bpm-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {label}
        <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-gray-500">
        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        No account needed
      </p>
    </div>
  );
}
