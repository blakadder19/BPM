/**
 * Phase 12 — public-event-page "Book now" CTA analytics.
 *
 * The CTAs live on the mobile-first public event landing (used for
 * paid ads). Each Book-now click should:
 *
 *   1. Push a GTM-friendly custom event on `dataLayer` so ad managers
 *      can wire this to a Google Ads "InitiateCheckout" trigger
 *      without touching the codebase again. The event name is
 *      `event_book_now_click` — matches the button's
 *      `data-tracking-event` attribute for parity.
 *   2. Fire a Meta Pixel `InitiateCheckout` standard event so Meta's
 *      funnel can attribute impressions → CTA clicks separately from
 *      the eventual Purchase fired on the checkout-success page.
 *   3. NOT fire `Purchase` — that stays on the success page and is
 *      the source of truth for revenue attribution.
 *
 * Both fires are no-op safe when the platforms are unconfigured
 * (`isMetaPixelConfigured` / `isGtmConfigured`).
 *
 * Rapid-click dedup: users on mobile sometimes double-tap the sticky
 * CTA. We use a module-level `Map<key, timestampMs>` to swallow any
 * click within `RAPID_CLICK_DEBOUNCE_MS` for the same event id + CTA
 * location. This is deliberately in-memory and per-tab — a user
 * legitimately clicking the CTA again after 1s should still fire, and
 * a fresh page load starts with a clean map. We do NOT use
 * sessionStorage here because InitiateCheckout is expected to fire
 * multiple times per browsing session (unlike Purchase, which is
 * one-shot per Stripe session id).
 */

import {
  isGtmConfigured,
  isMetaPixelConfigured,
  trackMetaEvent,
} from "@/lib/analytics/tracking";

export const RAPID_CLICK_DEBOUNCE_MS = 800;

export type BookNowCtaLocation = "hero" | "sticky" | "products";

export interface BookNowClickInput {
  /** Special event id — required for tracking + dedup. */
  eventId: string;
  /** Optional event name (title) — attached as `content_name`. */
  eventName?: string | null;
  /** Optional starting price (minor units) so ads can attribute value. */
  fromPriceCents?: number | null;
  /**
   * Where on the page the CTA lives — enables ad managers to A/B the
   * hero button vs the sticky bottom bar without new tags. Also used
   * as part of the debounce key so the two CTAs don't cancel each
   * other's fires.
   */
  ctaLocation: BookNowCtaLocation;
}

interface DataLayerWindow {
  dataLayer?: unknown[];
}

/**
 * In-memory rapid-click debounce store. Exported ONLY for unit tests
 * (so tests can reset between cases). Do not read/write from app code.
 * @internal
 */
export const _lastFireAt = new Map<string, number>();

function debounceKey(input: BookNowClickInput): string {
  return `${input.eventId}::${input.ctaLocation}`;
}

/**
 * Returns true when a click for the same (eventId, ctaLocation) pair
 * arrived within `RAPID_CLICK_DEBOUNCE_MS` of the last fire. Pure
 * predicate — the caller is responsible for updating `_lastFireAt`
 * on a real fire (so a swallowed click doesn't extend the window).
 */
export function shouldDebounceBookNowClick(
  input: BookNowClickInput,
  now: number = Date.now(),
): boolean {
  const last = _lastFireAt.get(debounceKey(input));
  if (last === undefined) return false;
  return now - last < RAPID_CLICK_DEBOUNCE_MS;
}

/**
 * Fires the `event_book_now_click` dataLayer push + the Meta Pixel
 * `InitiateCheckout` event. Returns `true` if a fire happened,
 * `false` if the click was debounced. Never throws.
 *
 * SSR-safe: no-op when `window` is undefined.
 */
export function fireBookNowClick(input: BookNowClickInput): boolean {
  if (typeof window === "undefined") return false;
  if (!input.eventId) return false;

  if (shouldDebounceBookNowClick(input)) return false;
  _lastFireAt.set(debounceKey(input), Date.now());

  // 1) GTM / dataLayer — always push, even when GTM is unconfigured.
  //    The push itself is a plain array mutation and cannot throw;
  //    if GTM is configured it will pick it up on the next tick.
  try {
    const w = window as unknown as DataLayerWindow;
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({
      event: "event_book_now_click",
      event_id: input.eventId,
      event_name: input.eventName ?? undefined,
      cta_location: input.ctaLocation,
      from_price_cents: input.fromPriceCents ?? undefined,
      // GA4-friendly value in currency's major unit — helpful when
      // wiring the event to an Ads "click" conversion with a value.
      value:
        typeof input.fromPriceCents === "number" &&
        Number.isFinite(input.fromPriceCents)
          ? input.fromPriceCents / 100
          : undefined,
      currency: "EUR",
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[event-cta] dataLayer push failed (non-fatal):",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // 2) Meta Pixel — InitiateCheckout is the correct standard event
  //    for a "the user pressed the CTA that leads to checkout"
  //    signal. Never fire Purchase here; Purchase lives on the
  //    checkout-success page. content_ids uses the event id so the
  //    same signal deduplicates cleanly across paid ads/pixel funnels.
  if (isMetaPixelConfigured()) {
    trackMetaEvent({
      eventName: "InitiateCheckout",
      value:
        typeof input.fromPriceCents === "number" &&
        Number.isFinite(input.fromPriceCents)
          ? input.fromPriceCents / 100
          : undefined,
      currency: "EUR",
      custom: {
        content_type: "event_ticket",
        content_ids: [input.eventId],
        content_name: input.eventName ?? undefined,
        content_category: "event",
        cta_location: input.ctaLocation,
      },
    });
  }

  // 3) Dev diagnostic — never in production. Helps Meta Pixel Helper
  //    QA (developer sees the fire in console next to fbq log).
  if (
    process.env.NODE_ENV !== "production" &&
    (isGtmConfigured() || isMetaPixelConfigured())
  ) {
    console.debug(
      `[event-cta] Book-now fired: eventId=${input.eventId} loc=${input.ctaLocation}`,
    );
  }

  return true;
}

// ── beginner-friendly heuristic ──────────────────────────────
//
// The event schema has no dedicated "beginner-friendly" flag, so we
// derive it from what's already there. We treat the event as
// beginner-friendly if any of the human-readable strings (title,
// subtitle, description) OR any product name contain the substring
// "beginner" (case-insensitive). Kept as a pure helper so the mobile
// summary can render a "Beginner-friendly" badge without leaking
// heuristic logic into the render layer.
//
// If a future migration adds a real column on `special_events`, this
// helper becomes the single place to widen.

const BEGINNER_RE = /beginner/i;

export interface BeginnerHeuristicInput {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  productNames?: readonly string[];
}

export function isBeginnerFriendlyEvent(
  input: BeginnerHeuristicInput,
): boolean {
  if (BEGINNER_RE.test(input.title ?? "")) return true;
  if (BEGINNER_RE.test(input.subtitle ?? "")) return true;
  if (BEGINNER_RE.test(input.description ?? "")) return true;
  if (
    input.productNames?.some((n) => typeof n === "string" && BEGINNER_RE.test(n))
  ) {
    return true;
  }
  return false;
}

// ── price-summary helpers ────────────────────────────────────

export interface PriceSummary {
  /** Cheapest ticket in minor units, or null when no tickets exist. */
  fromCents: number | null;
  /** True when every ticket is priced identically (so UI can drop "from"). */
  allSamePrice: boolean;
}

/**
 * Compute a compact price summary for the CTA / mobile summary card.
 * Considers only products that are actually purchasable at the moment
 * (`salesOpen && isVisible` — callers should pre-filter). Members-only
 * products are still included in the min-price calculation because
 * they are legitimately visible on the page; a beginner might well be
 * signing up to buy a membership pass.
 */
export function summarizeEventPrices(
  products: readonly { priceCents: number }[],
): PriceSummary {
  if (products.length === 0) return { fromCents: null, allSamePrice: true };
  let min = Infinity;
  let max = -Infinity;
  for (const p of products) {
    if (typeof p.priceCents !== "number" || !Number.isFinite(p.priceCents)) continue;
    if (p.priceCents < min) min = p.priceCents;
    if (p.priceCents > max) max = p.priceCents;
  }
  if (!Number.isFinite(min)) return { fromCents: null, allSamePrice: true };
  return { fromCents: min, allSamePrice: min === max };
}
