/**
 * Phase 8 — Google Ads / GTM / Meta Pixel conversion tracking helpers.
 *
 * All IDs come from public NEXT_PUBLIC_* env vars so they can be read
 * at runtime in both the server (layout) and the client (conversion
 * tracker). If any ID is missing, the corresponding platform is a
 * silent no-op — the app must never break due to unset analytics vars.
 *
 * These helpers are pure and safe to import from server components,
 * client components, and tests. No side effects at import time.
 *
 * Concurrency / order:
 *   - GTM base script is injected in the root layout via `next/script`.
 *   - Meta Pixel base script is injected in the root layout via
 *     `next/script` (afterInteractive).
 *   - `trackGoogleConversion` / `trackMetaEvent` are called from a
 *     `useEffect` on the thank-you / success page ONLY after the base
 *     scripts have had a chance to load. If gtag/fbq isn't defined
 *     yet (very unlikely with afterInteractive + user redirect), we
 *     queue via `window.dataLayer` / `fbq` respectively — both APIs
 *     accept queued calls before load.
 */

// ── env-driven configuration ──────────────────────────────────

/**
 * Read a NEXT_PUBLIC_ var lazily. Never memoised — Next inlines these
 * at build time, so `process.env.NEXT_PUBLIC_X` is effectively a
 * compile-time constant per environment.
 */
function readEnv(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed || null;
}

export function getGtmId(): string | null {
  return readEnv("NEXT_PUBLIC_GTM_ID");
}

export function getGoogleAdsId(): string | null {
  return readEnv("NEXT_PUBLIC_GOOGLE_ADS_ID");
}

export function getGoogleAdsConversionLabel(
  key: "beginners" | "purchase",
): string | null {
  if (key === "beginners") {
    return readEnv("NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGINNERS");
  }
  return readEnv("NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_PURCHASE");
}

export function getMetaPixelId(): string | null {
  return readEnv("NEXT_PUBLIC_META_PIXEL_ID");
}

// ── configured-guards ────────────────────────────────────────

export function isGtmConfigured(): boolean {
  return getGtmId() !== null;
}

export function isGoogleAdsConfigured(): boolean {
  return getGoogleAdsId() !== null;
}

export function isMetaPixelConfigured(): boolean {
  return getMetaPixelId() !== null;
}

// ── send_to builder for Google Ads ───────────────────────────

/**
 * Build the `send_to` string for a Google Ads conversion event.
 * Returns null if either the Ads ID or the conversion label is missing.
 * Shape: `AW-1234567890/AbCdEfGhIj`.
 */
export function googleAdsSendTo(
  labelKey: "beginners" | "purchase",
): string | null {
  const adsId = getGoogleAdsId();
  const label = getGoogleAdsConversionLabel(labelKey);
  if (!adsId || !label) return null;
  return `${adsId}/${label}`;
}

// ── client-side firing helpers ───────────────────────────────
//
// These are the only functions that touch `window.*`. They are
// callable safely from any context (they no-op when running server-
// side or when the platform is unconfigured). The base scripts (GTM
// + fbq) each queue calls made before the network script has finished
// loading, so ordering with `afterInteractive` next/script is safe.

interface GtagWindow {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
  fbq?: (...args: unknown[]) => void;
}

function windowRef(): GtagWindow | null {
  if (typeof window === "undefined") return null;
  return window as unknown as GtagWindow;
}

export interface GoogleConversionInput {
  /** Pre-built send_to. Use `googleAdsSendTo(...)` to produce it. */
  sendTo: string;
  /** Optional monetary value in the given currency. */
  value?: number;
  /** ISO-4217 currency code. Defaults to EUR. */
  currency?: string;
  /**
   * Optional transaction id, used both by Google Ads for dedup and by
   * our own sessionStorage guard. Highly recommended for real
   * purchases (use the Stripe session id).
   */
  transactionId?: string;
}

/**
 * Fires the `conversion` event via gtag. No-op if GTM/gtag hasn't
 * loaded (in that case the event goes onto `dataLayer` and GTM picks
 * it up when it initialises).
 */
export function trackGoogleConversion(input: GoogleConversionInput): void {
  const w = windowRef();
  if (!w) return;

  const payload: Record<string, unknown> = { send_to: input.sendTo };
  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    payload.value = input.value;
    payload.currency = input.currency ?? "EUR";
  }
  if (input.transactionId) {
    payload.transaction_id = input.transactionId;
  }

  // Prefer gtag if available (GTM installs it), otherwise fall back
  // to pushing directly onto the dataLayer so GTM's built-in tag
  // triggers can still fire the conversion later.
  if (typeof w.gtag === "function") {
    w.gtag("event", "conversion", payload);
    return;
  }
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ event: "conversion", ...payload });
}

/**
 * Meta Pixel standard event names actually used by BPM. The full
 * `MetaEventInput.eventName` also accepts arbitrary strings so callers
 * can pass any Meta standard/custom name without editing this union.
 *
 * Kept as an exported type so the `<ConversionTracker>` prop can share
 * exactly the same shape and stay in sync with the tracking helper.
 */
export type MetaStandardEventName =
  | "Lead"
  | "CompleteRegistration"
  | "Purchase"
  | "Subscribe"
  | "Schedule";

export interface MetaEventInput {
  /** Meta standard event name (or custom string). */
  eventName: MetaStandardEventName | (string & {});
  /** Optional monetary value (Purchase). */
  value?: number;
  /** ISO-4217 currency (Purchase). Defaults to EUR. */
  currency?: string;
  /**
   * eventID for deduplication when server-side + client-side (CAPI)
   * both fire the same event. Also used by our sessionStorage guard.
   */
  eventId?: string;
  /** Optional additional custom params passed straight to fbq. */
  custom?: Record<string, unknown>;
}

/**
 * Fires a Meta Pixel event via fbq. No-op if the pixel isn't loaded.
 */
export function trackMetaEvent(input: MetaEventInput): void {
  const w = windowRef();
  if (!w || typeof w.fbq !== "function") return;

  const params: Record<string, unknown> = { ...(input.custom ?? {}) };
  if (typeof input.value === "number" && Number.isFinite(input.value)) {
    params.value = input.value;
    params.currency = input.currency ?? "EUR";
  }

  if (input.eventId) {
    w.fbq("track", input.eventName, params, { eventID: input.eventId });
  } else {
    w.fbq("track", input.eventName, params);
  }
}

// ── sessionStorage dedup key ─────────────────────────────────

/**
 * Deterministic key for sessionStorage-based dedup of a conversion
 * fire. Includes the page pathname so multiple funnels don't collide.
 */
export function buildDedupKey(input: {
  pathname: string;
  transactionId?: string | null;
  eventName?: string | null;
}): string {
  const tx = input.transactionId?.trim();
  const evt = input.eventName?.trim() || "conversion";
  const path = input.pathname || "/";
  return tx ? `bpm:conv:${path}:${evt}:${tx}` : `bpm:conv:${path}:${evt}`;
}
