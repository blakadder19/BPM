"use client";

/**
 * Phase 8 — client-side conversion firer.
 *
 * Mount this component on thank-you / success pages ONLY. On mount:
 *   1. Compute a stable dedup key from pathname + transactionId + eventName.
 *   2. If sessionStorage already contains the key, do nothing.
 *      → prevents duplicate fires on refresh, back/forward navigation,
 *        or a browser-restored tab.
 *   3. Otherwise fire the Google Ads conversion (if configured) and
 *      the Meta Pixel event (if configured), then write the key.
 *
 * The event name / send_to string / value / currency are all provided
 * by the parent server component so they can be derived from real
 * fulfillment data (e.g. Stripe amount_total). This component itself
 * never reads env vars — the parent uses the tracking helpers to
 * resolve them at render time.
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  buildDedupKey,
  trackGoogleConversion,
  trackMetaEvent,
  type MetaStandardEventName,
} from "@/lib/analytics/tracking";

export interface ConversionTrackerProps {
  /**
   * Google Ads send_to string ("AW-XXX/LABEL"). Pass null when Google
   * Ads is not configured or this funnel has no assigned label.
   */
  googleSendTo?: string | null;
  /**
   * Meta Pixel event to fire. Pass null when Meta is not configured.
   * Accepts every standard event BPM currently uses (Lead,
   * CompleteRegistration, Purchase, Subscribe, Schedule) plus any
   * custom event name via the `(string & {})` fallback.
   */
  metaEventName?: MetaStandardEventName | (string & {}) | null;
  /** Optional monetary value (e.g. Stripe amount_total in the currency's major unit). */
  value?: number | null;
  /** ISO-4217. Defaults to EUR when value is set. */
  currency?: string | null;
  /**
   * Deduplication id. When set, both platforms receive it and our
   * sessionStorage key uses it — so a refresh cannot double-fire and
   * server-side CAPI events (if BPM adds them later) can dedupe
   * cleanly.
   */
  transactionId?: string | null;
  /**
   * Optional client-side sessionStorage-scoped dedup override — used
   * when the parent already knows a friendly label (e.g. product id).
   * Defaults to the meta event name.
   */
  dedupEventName?: string | null;
  /**
   * Optional Meta `content_name` param — the product/class/registration
   * name the event refers to. Passed through to fbq's custom params.
   */
  contentName?: string | null;
  /**
   * Optional Meta `content_category` param — used for e.g. dance style
   * on class bookings, product type on subscriptions.
   */
  contentCategory?: string | null;
  /**
   * Escape hatch for extra fbq custom params merged into the event.
   * Prefer `contentName` / `contentCategory` for the common cases.
   */
  metaCustom?: Record<string, unknown> | null;
}

export function ConversionTracker({
  googleSendTo = null,
  metaEventName = null,
  value = null,
  currency = null,
  transactionId = null,
  dedupEventName = null,
  contentName = null,
  contentCategory = null,
  metaCustom = null,
}: ConversionTrackerProps) {
  const pathname = usePathname();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (typeof window === "undefined") return;

    // Nothing to fire — component is safe to mount without any
    // platform configured (e.g. dev/preview without env vars).
    if (!googleSendTo && !metaEventName) return;

    const dedupKey = buildDedupKey({
      pathname: pathname ?? "/",
      transactionId,
      eventName: dedupEventName ?? metaEventName ?? "conversion",
    });

    try {
      const already = window.sessionStorage.getItem(dedupKey);
      if (already) {
        firedRef.current = true;
        return;
      }
    } catch {
      // sessionStorage disabled — proceed without dedup rather than skip.
    }

    if (googleSendTo) {
      trackGoogleConversion({
        sendTo: googleSendTo,
        value: value ?? undefined,
        currency: currency ?? undefined,
        transactionId: transactionId ?? undefined,
      });
    }

    if (metaEventName) {
      // Merge content_name / content_category convenience props on top
      // of the free-form metaCustom so callers can just pass friendly
      // strings without knowing the fbq param name.
      const custom: Record<string, unknown> = { ...(metaCustom ?? {}) };
      if (contentName) custom.content_name = contentName;
      if (contentCategory) custom.content_category = contentCategory;
      trackMetaEvent({
        eventName: metaEventName,
        value: value ?? undefined,
        currency: currency ?? undefined,
        eventId: transactionId ?? undefined,
        custom: Object.keys(custom).length > 0 ? custom : undefined,
      });
    }

    try {
      window.sessionStorage.setItem(dedupKey, String(Date.now()));
    } catch {
      // best-effort — the ref guard below still blocks in-tab repeats.
    }
    firedRef.current = true;
  }, [
    googleSendTo,
    metaEventName,
    value,
    currency,
    transactionId,
    dedupEventName,
    contentName,
    contentCategory,
    metaCustom,
    pathname,
  ]);

  return null;
}
