import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "NEXT_PUBLIC_GTM_ID",
  "NEXT_PUBLIC_GOOGLE_ADS_ID",
  "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGINNERS",
  "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_PURCHASE",
  "NEXT_PUBLIC_META_PIXEL_ID",
] as const;

function setEnv(vals: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) {
    if (vals[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = vals[k];
    }
  }
}

async function importFresh() {
  vi.resetModules();
  return await import("@/lib/analytics/tracking");
}

describe("analytics/tracking — env helpers", () => {
  const originals: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) originals[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originals[k] === undefined) delete process.env[k];
      else process.env[k] = originals[k];
    }
  });

  it("reports every platform as unconfigured when no env vars are set", async () => {
    setEnv({});
    const t = await importFresh();
    expect(t.isGtmConfigured()).toBe(false);
    expect(t.isGoogleAdsConfigured()).toBe(false);
    expect(t.isMetaPixelConfigured()).toBe(false);
    expect(t.getGtmId()).toBeNull();
    expect(t.googleAdsSendTo("beginners")).toBeNull();
    expect(t.googleAdsSendTo("purchase")).toBeNull();
  });

  it("treats whitespace-only env vars as unset", async () => {
    setEnv({ NEXT_PUBLIC_GTM_ID: "   " });
    const t = await importFresh();
    expect(t.isGtmConfigured()).toBe(false);
    expect(t.getGtmId()).toBeNull();
  });

  it("reports GTM as configured when NEXT_PUBLIC_GTM_ID is set", async () => {
    setEnv({ NEXT_PUBLIC_GTM_ID: "GTM-ABC123" });
    const t = await importFresh();
    expect(t.isGtmConfigured()).toBe(true);
    expect(t.getGtmId()).toBe("GTM-ABC123");
  });

  it("reports Meta Pixel as configured only when the pixel id is set", async () => {
    setEnv({ NEXT_PUBLIC_META_PIXEL_ID: "1234567890" });
    const t = await importFresh();
    expect(t.isMetaPixelConfigured()).toBe(true);
    expect(t.getMetaPixelId()).toBe("1234567890");
  });

  it("returns null send_to when either the Ads id or the label is missing", async () => {
    setEnv({ NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-999" }); // no label
    const t = await importFresh();
    expect(t.googleAdsSendTo("beginners")).toBeNull();
  });

  it("builds the correct beginners send_to when both id and label are set", async () => {
    setEnv({
      NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-999",
      NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_BEGINNERS: "abc123",
    });
    const t = await importFresh();
    expect(t.googleAdsSendTo("beginners")).toBe("AW-999/abc123");
    // The purchase label isn't set — must still be null so we don't
    // fire the beginners conversion on the checkout success page.
    expect(t.googleAdsSendTo("purchase")).toBeNull();
  });

  it("builds the correct purchase send_to independently of beginners", async () => {
    setEnv({
      NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-777",
      NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL_PURCHASE: "purchZ",
    });
    const t = await importFresh();
    expect(t.googleAdsSendTo("purchase")).toBe("AW-777/purchZ");
    expect(t.googleAdsSendTo("beginners")).toBeNull();
  });
});

describe("analytics/tracking — buildDedupKey", () => {
  it("includes transaction id when provided", async () => {
    const t = await importFresh();
    const k = t.buildDedupKey({
      pathname: "/checkout/success",
      transactionId: "cs_test_123",
      eventName: "Purchase",
    });
    expect(k).toBe("bpm:conv:/checkout/success:Purchase:cs_test_123");
  });

  it("omits transaction id when missing and falls back to eventName default", async () => {
    const t = await importFresh();
    const k = t.buildDedupKey({
      pathname: "/thank-you/beginners-course",
      transactionId: null,
      eventName: undefined,
    });
    expect(k).toBe("bpm:conv:/thank-you/beginners-course:conversion");
  });

  it("uses default pathname when empty", async () => {
    const t = await importFresh();
    const k = t.buildDedupKey({
      pathname: "",
      transactionId: null,
      eventName: "Lead",
    });
    expect(k).toBe("bpm:conv:/:Lead");
  });

  it("keys differ for different transactions on the same page", async () => {
    const t = await importFresh();
    const a = t.buildDedupKey({
      pathname: "/checkout/success",
      transactionId: "cs_1",
      eventName: "Purchase",
    });
    const b = t.buildDedupKey({
      pathname: "/checkout/success",
      transactionId: "cs_2",
      eventName: "Purchase",
    });
    expect(a).not.toEqual(b);
  });

  it("keys differ for Purchase vs Subscribe on the same session (Phase 9)", async () => {
    const t = await importFresh();
    // /checkout/success fires both events for a membership session:
    // Purchase (using dedupEventName "stripe_purchase") and Subscribe
    // (using dedupEventName "stripe_membership_subscribe"). The keys
    // must be distinct so Meta records both events, not just the first.
    const purchase = t.buildDedupKey({
      pathname: "/checkout/success",
      transactionId: "cs_test_123",
      eventName: "stripe_purchase",
    });
    const subscribe = t.buildDedupKey({
      pathname: "/checkout/success",
      transactionId: "cs_test_123",
      eventName: "stripe_membership_subscribe",
    });
    expect(purchase).not.toEqual(subscribe);
  });

  it("keys are stable for the same signup confirmation regardless of URL query", async () => {
    const t = await importFresh();
    // /login?confirmed=1 — pathname is what usePathname() returns, so
    // query string never appears in the dedup key. Two visits with
    // different `?next=…` values must still dedup to the same key.
    const a = t.buildDedupKey({
      pathname: "/login",
      transactionId: null,
      eventName: "signup_confirmed",
    });
    const b = t.buildDedupKey({
      pathname: "/login",
      transactionId: null,
      eventName: "signup_confirmed",
    });
    expect(a).toEqual(b);
    expect(a).toBe("bpm:conv:/login:signup_confirmed");
  });
});

describe("analytics/tracking — client-side firing", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    // Restore whatever the test runner set (jsdom or undefined).
    if (originalWindow === undefined) {
      // @ts-expect-error node global cleanup
      delete globalThis.window;
    } else {
      (globalThis as { window: typeof window }).window = originalWindow;
    }
  });

  it("trackGoogleConversion is a no-op when window is undefined", async () => {
    // @ts-expect-error simulate server-side execution
    delete globalThis.window;
    const t = await importFresh();
    expect(() =>
      t.trackGoogleConversion({ sendTo: "AW-1/x", value: 10 }),
    ).not.toThrow();
  });

  it("trackGoogleConversion prefers gtag when defined", async () => {
    const gtagSpy = vi.fn();
    (globalThis as unknown as { window: unknown }).window = {
      gtag: gtagSpy,
      dataLayer: [],
    };
    const t = await importFresh();
    t.trackGoogleConversion({
      sendTo: "AW-1/x",
      value: 25,
      currency: "USD",
      transactionId: "cs_1",
    });
    expect(gtagSpy).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-1/x",
      value: 25,
      currency: "USD",
      transaction_id: "cs_1",
    });
  });

  it("trackGoogleConversion falls back to dataLayer when gtag is absent", async () => {
    const dl: unknown[] = [];
    (globalThis as unknown as { window: unknown }).window = {
      dataLayer: dl,
    };
    const t = await importFresh();
    t.trackGoogleConversion({ sendTo: "AW-1/x" });
    expect(dl).toHaveLength(1);
    expect(dl[0]).toMatchObject({ event: "conversion", send_to: "AW-1/x" });
  });

  it("trackGoogleConversion defaults currency to EUR when only value is set", async () => {
    const gtagSpy = vi.fn();
    (globalThis as unknown as { window: unknown }).window = { gtag: gtagSpy };
    const t = await importFresh();
    t.trackGoogleConversion({ sendTo: "AW-1/x", value: 5 });
    expect(gtagSpy).toHaveBeenCalledWith(
      "event",
      "conversion",
      expect.objectContaining({ value: 5, currency: "EUR" }),
    );
  });

  it("trackMetaEvent no-ops when fbq is absent", async () => {
    (globalThis as unknown as { window: unknown }).window = {};
    const t = await importFresh();
    expect(() => t.trackMetaEvent({ eventName: "Lead" })).not.toThrow();
  });

  it("trackMetaEvent calls fbq with eventID when provided", async () => {
    const fbqSpy = vi.fn();
    (globalThis as unknown as { window: unknown }).window = { fbq: fbqSpy };
    const t = await importFresh();
    t.trackMetaEvent({
      eventName: "Purchase",
      value: 12.5,
      currency: "eur",
      eventId: "cs_test_1",
    });
    expect(fbqSpy).toHaveBeenCalledWith(
      "track",
      "Purchase",
      { value: 12.5, currency: "eur" },
      { eventID: "cs_test_1" },
    );
  });

  it("trackMetaEvent calls fbq without the fourth arg when no eventId", async () => {
    const fbqSpy = vi.fn();
    (globalThis as unknown as { window: unknown }).window = { fbq: fbqSpy };
    const t = await importFresh();
    t.trackMetaEvent({ eventName: "Lead" });
    expect(fbqSpy).toHaveBeenCalledWith("track", "Lead", {});
  });

  it("trackMetaEvent supports the widened standard event names (Subscribe / Schedule / CompleteRegistration)", async () => {
    const fbqSpy = vi.fn();
    (globalThis as unknown as { window: unknown }).window = { fbq: fbqSpy };
    const t = await importFresh();
    t.trackMetaEvent({ eventName: "CompleteRegistration" });
    t.trackMetaEvent({
      eventName: "Subscribe",
      value: 60,
      currency: "EUR",
      eventId: "sub-1",
    });
    t.trackMetaEvent({
      eventName: "Schedule",
      eventId: "book-1",
      custom: { content_name: "Bachata Beginners" },
    });
    expect(fbqSpy).toHaveBeenNthCalledWith(1, "track", "CompleteRegistration", {});
    expect(fbqSpy).toHaveBeenNthCalledWith(
      2,
      "track",
      "Subscribe",
      { value: 60, currency: "EUR" },
      { eventID: "sub-1" },
    );
    expect(fbqSpy).toHaveBeenNthCalledWith(
      3,
      "track",
      "Schedule",
      { content_name: "Bachata Beginners" },
      { eventID: "book-1" },
    );
  });

  it("trackMetaEvent passes free-form custom params through unchanged", async () => {
    const fbqSpy = vi.fn();
    (globalThis as unknown as { window: unknown }).window = { fbq: fbqSpy };
    const t = await importFresh();
    t.trackMetaEvent({
      eventName: "Schedule",
      custom: { content_name: "Salsa Intermediate", content_category: "Salsa" },
    });
    expect(fbqSpy).toHaveBeenCalledWith("track", "Schedule", {
      content_name: "Salsa Intermediate",
      content_category: "Salsa",
    });
  });
});
