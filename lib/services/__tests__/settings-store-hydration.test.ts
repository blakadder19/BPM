import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Production hydration contract for the settings store: concurrent loads
 * share one read, failed reads never count as loaded or fall back to
 * defaults, and the store recovers once the database is reachable again.
 */

type Row = { value: Record<string, unknown>; academy_id: string } | null;

const h = vi.hoisted(() => ({
  row: null as Row,
  readError: null as null | { message: string; code?: string },
  readThrows: null as null | Error,
  readGate: null as null | Promise<void>,
  reads: 0,
  writeError: null as null | { message: string },
  upserts: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/dance-style-store", () => ({ getDanceStyles: () => [] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            h.reads += 1;
            if (h.readGate) await h.readGate;
            if (h.readThrows) throw h.readThrows;
            return { data: h.readError ? null : h.row, error: h.readError };
          },
        }),
        limit: () => ({
          maybeSingle: async () => ({ data: table === "academies" ? { id: "acad-1" } : null, error: null }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        if (h.writeError) return { error: h.writeError };
        h.upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

import {
  getSettings,
  hydrateSettings,
  resetSettingsHydration,
  updateSettings,
  SettingsUnavailableError,
  SETTINGS_RETRY_COOLDOWN_MS,
} from "@/lib/services/settings-store";

const CONFIGURED = {
  vatEnabled: true,
  vatRatePercent: 23,
  vatPriceMode: "exclusive",
  lateCancelFeeCents: 300,
  noShowFeeCents: 700,
};

const SCHEMA_CACHE_OUTAGE = {
  code: "PGRST002",
  message: "Could not query the database for the schema cache. Retrying.",
};

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function gate(): () => void {
  let release!: () => void;
  h.readGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return release;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  h.row = { value: { ...CONFIGURED }, academy_id: "acad-1" };
  h.readError = null;
  h.readThrows = null;
  h.readGate = null;
  h.reads = 0;
  h.writeError = null;
  h.upserts.length = 0;
  resetSettingsHydration();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (savedEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key;
});

describe("concurrent hydration", () => {
  it("makes every concurrent caller wait for the single in-flight read", async () => {
    const release = gate();
    const first = hydrateSettings();
    let secondSettled = false;
    const second = hydrateSettings().then(() => {
      secondSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondSettled).toBe(false);
    expect(h.reads).toBe(1);

    release();
    await Promise.all([first, second]);
    expect(h.reads).toBe(1);
    expect(getSettings().vatRatePercent).toBe(23);
  });

  it("refuses synchronous reads while the load is in flight instead of serving defaults", async () => {
    const release = gate();
    const load = hydrateSettings();
    expect(() => getSettings()).toThrow(SettingsUnavailableError);
    release();
    await load;
    expect(getSettings().vatEnabled).toBe(true);
  });

  it("does not let an older in-flight read overwrite a save that finished first", async () => {
    const release = gate();
    const load = hydrateSettings();
    h.readGate = null;
    h.row = { value: { ...CONFIGURED }, academy_id: "acad-1" };
    await updateSettings({ lateCancelFeeCents: 450 });
    release();
    await load;
    expect(getSettings().lateCancelFeeCents).toBe(450);
  });
});

describe("failed hydration", () => {
  it("treats a Supabase error response as a failure, not as 'no settings saved'", async () => {
    h.readError = SCHEMA_CACHE_OUTAGE;
    await expect(hydrateSettings()).rejects.toBeInstanceOf(SettingsUnavailableError);
    expect(() => getSettings()).toThrow(SettingsUnavailableError);
  });

  it("treats a thrown network error as a failure", async () => {
    h.readThrows = new Error("fetch failed");
    await expect(hydrateSettings()).rejects.toBeInstanceOf(SettingsUnavailableError);
    expect(() => getSettings()).toThrow(SettingsUnavailableError);
  });

  it("never serves default financial rules after a failed load", async () => {
    h.readError = SCHEMA_CACHE_OUTAGE;
    await hydrateSettings().catch(() => {});
    let served: ReturnType<typeof getSettings> | null = null;
    try {
      served = getSettings();
    } catch (e) {
      expect(e).toBeInstanceOf(SettingsUnavailableError);
    }
    expect(served).toBeNull();
  });

  it("rejects every caller that was waiting on the failed read", async () => {
    h.readError = SCHEMA_CACHE_OUTAGE;
    const results = await Promise.allSettled([hydrateSettings(), hydrateSettings(), hydrateSettings()]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(h.reads).toBe(1);
  });
});

describe("recovery after the database comes back", () => {
  it("fails fast during the cooldown, then retries and loads the configured settings", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T11:26:00Z"));

    h.readError = SCHEMA_CACHE_OUTAGE;
    await expect(hydrateSettings()).rejects.toBeInstanceOf(SettingsUnavailableError);
    expect(h.reads).toBe(1);

    h.readError = null;
    vi.setSystemTime(new Date(Date.now() + SETTINGS_RETRY_COOLDOWN_MS - 1));
    await expect(hydrateSettings()).rejects.toBeInstanceOf(SettingsUnavailableError);
    expect(h.reads).toBe(1);

    vi.setSystemTime(new Date(Date.now() + 2));
    await hydrateSettings();
    expect(h.reads).toBe(2);
    const settings = getSettings();
    expect(settings.vatEnabled).toBe(true);
    expect(settings.vatRatePercent).toBe(23);
    expect(settings.lateCancelFeeCents).toBe(300);
  });

  it("keeps retrying while the outage lasts and loads once on success", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T11:26:00Z"));
    h.readError = SCHEMA_CACHE_OUTAGE;

    for (let i = 0; i < 3; i++) {
      await expect(hydrateSettings()).rejects.toBeInstanceOf(SettingsUnavailableError);
      vi.setSystemTime(new Date(Date.now() + SETTINGS_RETRY_COOLDOWN_MS));
    }
    expect(h.reads).toBe(3);

    h.readError = null;
    await hydrateSettings();
    await hydrateSettings();
    expect(h.reads).toBe(4);
    expect(getSettings().noShowFeeCents).toBe(700);
  });
});

describe("legitimately missing settings row", () => {
  it("uses defaults only when the read succeeds and no row exists", async () => {
    h.row = null;
    await hydrateSettings();
    expect(getSettings().vatEnabled).toBe(false);
  });
});

describe("updateSettings", () => {
  it("merges into the row as it is in the database, not a stale cache", async () => {
    await hydrateSettings();
    h.row = { value: { ...CONFIGURED, noShowFeeCents: 900 }, academy_id: "acad-1" };
    await updateSettings({ lateCancelFeeCents: 250 });
    const written = h.upserts.at(-1)?.value as Record<string, unknown>;
    expect(written.noShowFeeCents).toBe(900);
    expect(written.lateCancelFeeCents).toBe(250);
    expect(written.vatRatePercent).toBe(23);
  });

  it("writes configured rules, not defaults, when the cache never loaded", async () => {
    h.readError = SCHEMA_CACHE_OUTAGE;
    await hydrateSettings().catch(() => {});
    h.readError = null;
    await updateSettings({ lateCancelFeeCents: 250 });
    const written = h.upserts.at(-1)?.value as Record<string, unknown>;
    expect(written.vatEnabled).toBe(true);
    expect(written.vatRatePercent).toBe(23);
    expect(getSettings().lateCancelFeeCents).toBe(250);
  });

  it("writes nothing and throws when the fresh read fails", async () => {
    await hydrateSettings();
    h.readError = SCHEMA_CACHE_OUTAGE;
    await expect(updateSettings({ lateCancelFeeCents: 250 })).rejects.toThrow();
    expect(h.upserts).toHaveLength(0);
    expect(getSettings().lateCancelFeeCents).toBe(300);
  });

  it("throws and keeps the cache unchanged when the write fails", async () => {
    await hydrateSettings();
    h.writeError = { message: "permission denied" };
    await expect(updateSettings({ lateCancelFeeCents: 250 })).rejects.toThrow("permission denied");
    expect(getSettings().lateCancelFeeCents).toBe(300);
  });
});
