/**
 * `updateReceiptBusinessSettings` replaces only `receiptBusiness`, merging
 * into the settings row as it is in the database now (not this instance's
 * possibly stale cache), and never writes when the read fails.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RECEIPT_BUSINESS_SETTINGS } from "@/lib/domain/receipt-settings";

const h = vi.hoisted(() => ({
  row: null as null | { value: Record<string, unknown>; academy_id: string },
  readError: null as null | { message: string },
  writeError: null as null | { message: string },
  upserts: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.readError ? null : h.row, error: h.readError }) }),
        limit: () => ({ maybeSingle: async () => ({ data: table === "academies" ? { id: "acad-1" } : null, error: null }) }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        if (h.writeError) return { error: h.writeError };
        h.upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

const ENV = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role";

import {
  getReceiptBusinessSettings,
  getSettings,
  hydrateSettings,
  resetSettingsHydration,
  updateReceiptBusinessSettings,
} from "../settings-store";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterAll(() => {
  restoreEnv("NEXT_PUBLIC_SUPABASE_URL", ENV.url);
  restoreEnv("SUPABASE_SERVICE_ROLE_KEY", ENV.key);
  resetSettingsHydration();
});

const details = { ...EMPTY_RECEIPT_BUSINESS_SETTINGS, tradingName: "Balance Power Motion", vatNumber: "IE1234567X" };

beforeEach(async () => {
  resetSettingsHydration();
  h.readError = null;
  h.writeError = null;
  h.upserts.length = 0;
  h.row = { value: { lateCancelFeeCents: 200 }, academy_id: "acad-1" };
  await hydrateSettings();
});

describe("updateReceiptBusinessSettings", () => {
  it("merges into the current database row, not the stale cache", async () => {
    h.row = { value: { lateCancelFeeCents: 300, provisionalNotes: "changed elsewhere" }, academy_id: "acad-1" };
    expect(getSettings().lateCancelFeeCents).toBe(200);

    expect(await updateReceiptBusinessSettings(details)).toEqual({ ok: true });
    expect(h.upserts).toHaveLength(1);
    const written = h.upserts[0].value as Record<string, unknown>;
    expect(written.lateCancelFeeCents).toBe(300);
    expect(written.provisionalNotes).toBe("changed elsewhere");
    expect(written.receiptBusiness).toMatchObject({ tradingName: "Balance Power Motion", vatNumber: "IE1234567X" });
    expect(getSettings().lateCancelFeeCents).toBe(300);
    expect(getReceiptBusinessSettings().vatNumber).toBe("IE1234567X");
  });

  it("writes nothing when the current settings cannot be read", async () => {
    h.readError = { message: "timeout" };
    const res = await updateReceiptBusinessSettings(details);
    expect(res.ok).toBe(false);
    expect(h.upserts).toHaveLength(0);
    expect(getReceiptBusinessSettings().tradingName).toBeNull();
  });

  it("reports a failed write and leaves the cache unchanged", async () => {
    h.writeError = { message: "denied" };
    const res = await updateReceiptBusinessSettings(details);
    expect(res).toEqual({ ok: false, error: "The settings could not be saved." });
    expect(getReceiptBusinessSettings().tradingName).toBeNull();
  });
});
