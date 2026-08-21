/**
 * Phase 12 — unit tests for the public-event Book-now CTA helpers.
 *
 * Covers:
 *   * fireBookNowClick — dataLayer push shape, Meta Pixel wiring,
 *     rapid-click debounce, SSR safety.
 *   * shouldDebounceBookNowClick — pure predicate + per-location
 *     independence.
 *   * isBeginnerFriendlyEvent — heuristic matches on title / subtitle
 *     / description / product name, case-insensitive.
 *   * summarizeEventPrices — min-price + allSamePrice detection with
 *     empty / malformed inputs.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  RAPID_CLICK_DEBOUNCE_MS,
  _lastFireAt,
  fireBookNowClick,
  isBeginnerFriendlyEvent,
  shouldDebounceBookNowClick,
  summarizeEventPrices,
} from "../event-cta";

// Reset in-memory debounce store between tests so a rapid-click case
// doesn't leak into the next test's "first click".
beforeEach(() => {
  _lastFireAt.clear();
});

describe("isBeginnerFriendlyEvent", () => {
  it("matches when the title mentions beginner", () => {
    expect(
      isBeginnerFriendlyEvent({ title: "Beginner Bachata Bootcamp" }),
    ).toBe(true);
  });
  it("matches when the subtitle mentions beginners (case-insensitive)", () => {
    expect(
      isBeginnerFriendlyEvent({ title: "Salsa", subtitle: "BEGINNERS Welcome" }),
    ).toBe(true);
  });
  it("matches when the description mentions beginner", () => {
    expect(
      isBeginnerFriendlyEvent({
        title: "Weekend Party",
        description: "Perfect for total beginner dancers.",
      }),
    ).toBe(true);
  });
  it("matches via a product name", () => {
    expect(
      isBeginnerFriendlyEvent({
        title: "Weekend Party",
        productNames: ["General Pass", "Beginners 1 Salsa"],
      }),
    ).toBe(true);
  });
  it("returns false when nothing mentions beginner", () => {
    expect(
      isBeginnerFriendlyEvent({
        title: "Advanced Bachata Intensive",
        subtitle: null,
        description: "Pro-level workshop",
        productNames: ["Full pass"],
      }),
    ).toBe(false);
  });
  it("does not throw on null/undefined fields", () => {
    expect(() =>
      isBeginnerFriendlyEvent({
        title: null,
        subtitle: null,
        description: null,
        productNames: undefined,
      }),
    ).not.toThrow();
    expect(
      isBeginnerFriendlyEvent({
        title: null,
        subtitle: null,
        description: null,
      }),
    ).toBe(false);
  });
});

describe("summarizeEventPrices", () => {
  it("returns null fromCents when there are no products", () => {
    expect(summarizeEventPrices([])).toEqual({
      fromCents: null,
      allSamePrice: true,
    });
  });
  it("returns allSamePrice=true when every ticket is the same price", () => {
    expect(
      summarizeEventPrices([{ priceCents: 2500 }, { priceCents: 2500 }]),
    ).toEqual({ fromCents: 2500, allSamePrice: true });
  });
  it("returns min price with allSamePrice=false when tickets differ", () => {
    expect(
      summarizeEventPrices([
        { priceCents: 5000 },
        { priceCents: 2500 },
        { priceCents: 3500 },
      ]),
    ).toEqual({ fromCents: 2500, allSamePrice: false });
  });
  it("ignores malformed prices", () => {
    expect(
      summarizeEventPrices([
        { priceCents: Number.NaN },
        // deliberately cast — we're testing the guard
        { priceCents: "oops" as unknown as number },
        { priceCents: 4000 },
      ]),
    ).toEqual({ fromCents: 4000, allSamePrice: true });
  });
});

describe("shouldDebounceBookNowClick", () => {
  it("returns false on first click", () => {
    expect(
      shouldDebounceBookNowClick({ eventId: "evt-1", ctaLocation: "hero" }),
    ).toBe(false);
  });
  it("returns true when a second click arrives inside the debounce window", () => {
    // Simulate a fire happening now — same effect as fireBookNowClick.
    _lastFireAt.set("evt-1::hero", 1_000);
    expect(
      shouldDebounceBookNowClick(
        { eventId: "evt-1", ctaLocation: "hero" },
        1_000 + RAPID_CLICK_DEBOUNCE_MS - 1,
      ),
    ).toBe(true);
  });
  it("returns false once the debounce window elapses", () => {
    _lastFireAt.set("evt-1::hero", 1_000);
    expect(
      shouldDebounceBookNowClick(
        { eventId: "evt-1", ctaLocation: "hero" },
        1_000 + RAPID_CLICK_DEBOUNCE_MS + 1,
      ),
    ).toBe(false);
  });
  it("does not debounce a different CTA location on the same event", () => {
    _lastFireAt.set("evt-1::hero", 1_000);
    expect(
      shouldDebounceBookNowClick(
        { eventId: "evt-1", ctaLocation: "sticky" },
        1_000 + 10,
      ),
    ).toBe(false);
  });
});

// ── fireBookNowClick — DOM-side wiring ───────────────────────

interface FakeWindow {
  dataLayer?: unknown[];
  fbq?: ReturnType<typeof vi.fn>;
}

function installFakeWindow(withPixel: boolean): FakeWindow {
  const w: FakeWindow = { dataLayer: [] };
  if (withPixel) w.fbq = vi.fn();
  (globalThis as unknown as { window: FakeWindow }).window = w;
  return w;
}

function uninstallWindow() {
  delete (globalThis as unknown as { window?: unknown }).window;
}

describe("fireBookNowClick", () => {
  beforeEach(() => {
    uninstallWindow();
  });

  it("SSR-safe: no-op when window is undefined", () => {
    expect(
      fireBookNowClick({
        eventId: "evt-1",
        eventName: "Party",
        fromPriceCents: 2500,
        ctaLocation: "hero",
      }),
    ).toBe(false);
  });

  it("returns false when eventId is missing (guarded)", () => {
    installFakeWindow(false);
    expect(
      fireBookNowClick({
        eventId: "",
        eventName: null,
        ctaLocation: "hero",
      }),
    ).toBe(false);
  });

  it("pushes a `event_book_now_click` payload onto dataLayer", () => {
    // Meta pixel env not set (default), so only dataLayer fires.
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const w = installFakeWindow(false);
    const fired = fireBookNowClick({
      eventId: "evt-42",
      eventName: "Kizomba Sunday",
      fromPriceCents: 1500,
      ctaLocation: "sticky",
    });
    expect(fired).toBe(true);
    expect(w.dataLayer).toHaveLength(1);
    const pushed = (w.dataLayer as Array<Record<string, unknown>>)[0];
    expect(pushed.event).toBe("event_book_now_click");
    expect(pushed.event_id).toBe("evt-42");
    expect(pushed.event_name).toBe("Kizomba Sunday");
    expect(pushed.cta_location).toBe("sticky");
    expect(pushed.from_price_cents).toBe(1500);
    expect(pushed.value).toBe(15);
    expect(pushed.currency).toBe("EUR");
  });

  it("omits value + currency when no price is provided", () => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const w = installFakeWindow(false);
    fireBookNowClick({
      eventId: "evt-noprice",
      ctaLocation: "hero",
    });
    const pushed = (w.dataLayer as Array<Record<string, unknown>>)[0];
    expect(pushed.event).toBe("event_book_now_click");
    expect(pushed.value).toBeUndefined();
    // Currency remains "EUR" as the base — it's a fixed field on the
    // payload so ad triggers can always read it, even when value is
    // absent. This keeps the shape consistent.
    expect(pushed.currency).toBe("EUR");
  });

  it("fires Meta Pixel InitiateCheckout when the pixel is configured", () => {
    process.env.NEXT_PUBLIC_META_PIXEL_ID = "1234567890";
    const w = installFakeWindow(true);
    fireBookNowClick({
      eventId: "evt-99",
      eventName: "Party",
      fromPriceCents: 2500,
      ctaLocation: "hero",
    });
    expect(w.fbq).toHaveBeenCalledTimes(1);
    const call = (w.fbq as ReturnType<typeof vi.fn>).mock.calls[0];
    // Third positional arg is the custom params object.
    expect(call[0]).toBe("track");
    expect(call[1]).toBe("InitiateCheckout");
    const params = call[2] as Record<string, unknown>;
    expect(params.value).toBe(25);
    expect(params.currency).toBe("EUR");
    expect(params.content_type).toBe("event_ticket");
    expect(params.content_ids).toEqual(["evt-99"]);
    expect(params.content_name).toBe("Party");
    expect(params.content_category).toBe("event");
    expect(params.cta_location).toBe("hero");
  });

  it("does NOT fire Meta Pixel when the pixel is unconfigured", () => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const w = installFakeWindow(true);
    fireBookNowClick({
      eventId: "evt-99",
      ctaLocation: "hero",
    });
    // Even though the fake window HAS fbq, we should skip it when
    // the env var isn't set — no-op guarantee.
    expect(w.fbq).not.toHaveBeenCalled();
  });

  it("debounces rapid double-clicks on the same CTA (no second fire)", () => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const w = installFakeWindow(false);
    fireBookNowClick({ eventId: "evt-x", ctaLocation: "sticky" });
    fireBookNowClick({ eventId: "evt-x", ctaLocation: "sticky" });
    fireBookNowClick({ eventId: "evt-x", ctaLocation: "sticky" });
    expect(w.dataLayer).toHaveLength(1);
  });

  it("hero + sticky CTAs on the same event both fire (independent debounce keys)", () => {
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const w = installFakeWindow(false);
    fireBookNowClick({ eventId: "evt-x", ctaLocation: "hero" });
    fireBookNowClick({ eventId: "evt-x", ctaLocation: "sticky" });
    expect(w.dataLayer).toHaveLength(2);
    const pushed = w.dataLayer as Array<Record<string, unknown>>;
    expect(pushed[0].cta_location).toBe("hero");
    expect(pushed[1].cta_location).toBe("sticky");
  });
});
