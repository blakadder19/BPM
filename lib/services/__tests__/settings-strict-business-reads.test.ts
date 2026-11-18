import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Code that applies business rules (VAT, penalty fees, cancellation cutoff,
 * check-in windows) must never run on default settings in Supabase mode —
 * not even when nothing has tried to load settings yet. These tests drive
 * the real settings store and the real rule functions.
 */

const h = vi.hoisted(() => ({
  readError: null as null | { message: string; code?: string },
  readGate: null as null | Promise<void>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/dance-style-store", () => ({ getDanceStyles: () => [] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (h.readGate) await h.readGate;
            if (h.readError) return { data: null, error: h.readError };
            return {
              data: {
                value: {
                  vatEnabled: true,
                  vatRatePercent: 23,
                  vatPriceMode: "exclusive",
                  applyVatToOnlinePayments: true,
                  applyVatToManualPayments: false,
                  lateCancelFeeCents: 300,
                  noShowFeeCents: 700,
                  lateCancelCutoffMinutes: 600,
                  selfCheckInEnabled: false,
                },
                academy_id: "acad-1",
              },
              error: null,
            };
          },
        }),
        limit: () => ({
          maybeSingle: async () => ({ data: table === "academies" ? { id: "acad-1" } : null, error: null }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  }),
}));

import {
  getLoadedSettings,
  getSettings,
  hydrateSettings,
  resetSettingsHydration,
  SettingsUnavailableError,
} from "@/lib/services/settings-store";
import { resolveVatFor } from "@/lib/services/pricing-service";
import { isLateCancellation, penaltyFeeCents } from "@/lib/domain/cancellation-rules";
import { canSelfCheckIn } from "@/lib/domain/checkin-rules";

const savedEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function useSupabaseMode() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
}

function inOneHour(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
}

beforeEach(() => {
  useSupabaseMode();
  h.readError = null;
  h.readGate = null;
  resetSettingsHydration();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = savedEnv.url;
  if (savedEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = savedEnv.key;
});

describe("before any settings load was attempted", () => {
  it("getLoadedSettings refuses where getSettings would serve defaults", () => {
    expect(() => getLoadedSettings()).toThrow(SettingsUnavailableError);
  });

  it("refuses to compute VAT instead of treating VAT as disabled", () => {
    expect(() => resolveVatFor(9000, "online")).toThrow(SettingsUnavailableError);
  });

  it("refuses to price a penalty instead of using the default fee", () => {
    expect(() => penaltyFeeCents("late_cancel")).toThrow(SettingsUnavailableError);
    expect(() => penaltyFeeCents("no_show")).toThrow(SettingsUnavailableError);
  });

  it("refuses to judge a late cancellation with the default cutoff", () => {
    expect(() => isLateCancellation(inOneHour(), new Date())).toThrow(SettingsUnavailableError);
  });

  it("refuses to open self check-in with default rules", () => {
    expect(() => canSelfCheckIn("2026-11-18", "19:00")).toThrow(SettingsUnavailableError);
  });
});

describe("while a load is in flight or after it failed", () => {
  it("refuses business reads during the in-flight load", async () => {
    let release!: () => void;
    h.readGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const load = hydrateSettings();
    expect(() => resolveVatFor(9000, "online")).toThrow(SettingsUnavailableError);
    release();
    await load;
  });

  it("refuses business reads after a database error", async () => {
    h.readError = { code: "PGRST002", message: "schema cache" };
    await expect(hydrateSettings()).rejects.toThrow(SettingsUnavailableError);
    expect(() => resolveVatFor(9000, "online")).toThrow(SettingsUnavailableError);
    expect(() => penaltyFeeCents("no_show")).toThrow(SettingsUnavailableError);
  });
});

describe("after settings were loaded from the database", () => {
  it("applies the configured rules", async () => {
    await hydrateSettings();
    const vat = resolveVatFor(10000, "online");
    expect(vat.vatApplied).toBe(true);
    expect(vat.vatRatePercent).toBe(23);
    expect(vat.vatAmountCents).toBe(2300);
    expect(penaltyFeeCents("late_cancel")).toBe(300);
    expect(penaltyFeeCents("no_show")).toBe(700);
    expect(isLateCancellation(inOneHour(), new Date())).toBe(true);
    expect(canSelfCheckIn("2026-11-18", "19:00").eligible).toBe(false);
    expect(getLoadedSettings()).toBe(getSettings());
  });
});

describe("without Supabase (local memory mode)", () => {
  it("keeps serving local settings", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getLoadedSettings()).not.toThrow();
    expect(() => penaltyFeeCents("late_cancel")).not.toThrow();
  });
});
