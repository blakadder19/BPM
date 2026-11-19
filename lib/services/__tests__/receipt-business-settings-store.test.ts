/**
 * `updateReceiptBusinessSettings` replaces only `receiptBusiness`, merging
 * into the settings row as it is in the database now (not this instance's
 * possibly stale cache), and never writes when the read fails.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_RECEIPT_BUSINESS_SETTINGS } from "@/lib/domain/receipt-settings";

type Row = { value: Record<string, unknown>; academy_id: string; updated_at?: string };

const h = vi.hoisted(() => ({
  row: null as null | Row,
  readError: null as null | { message: string },
  writeError: null as null | { message: string },
  writes: [] as Record<string, unknown>[],
  readGate: null as null | Promise<void>,
  /** Runs after each settings read, before the conditional write. */
  afterRead: null as null | (() => void),
  version: 0,
}));

// business_rules fake: updates only apply when updated_at still matches
// (the CAS the store relies on); every applied update bumps it.
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (h.readGate) await h.readGate;
            const data = h.readError || !h.row ? null : { ...h.row, updated_at: h.row.updated_at ?? "v0" };
            h.afterRead?.();
            return { data, error: h.readError };
          },
        }),
        limit: () => ({ maybeSingle: async () => ({ data: table === "academies" ? { id: "acad-1" } : null, error: null }) }),
      }),
      update: (patch: { value: Record<string, unknown> }) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return chain;
          },
          select: async () => {
            if (h.writeError) return { data: null, error: h.writeError };
            if (!h.row || (h.row.updated_at ?? "v0") !== filters.updated_at) return { data: [], error: null };
            h.row = { ...h.row, value: patch.value, updated_at: `v${++h.version}` };
            h.writes.push({ ...patch, academy_id: filters.academy_id, key: filters.key });
            return { data: [{ id: "row-1" }], error: null };
          },
        };
        return chain;
      },
      insert: async (row: Record<string, unknown>) => {
        if (h.writeError) return { error: h.writeError };
        h.writes.push(row);
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
  updateSettings,
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
  h.writes.length = 0;
  h.readGate = null;
  h.afterRead = null;
  h.version = 0;
  h.row = { value: { lateCancelFeeCents: 200 }, academy_id: "acad-1" };
  await hydrateSettings();
});

describe("hydrateSettings", () => {
  it("makes concurrent callers wait for the in-flight load instead of reading defaults", async () => {
    resetSettingsHydration();
    h.row = { value: { receiptBusiness: details }, academy_id: "acad-1" };
    let release!: () => void;
    h.readGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = hydrateSettings();
    let secondSettled = false;
    const second = hydrateSettings().then(() => {
      secondSettled = true;
      return getReceiptBusinessSettings();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondSettled).toBe(false);

    release();
    await first;
    expect((await second).vatNumber).toBe("IE1234567X");
  });
});

describe("updateReceiptBusinessSettings", () => {
  it("merges into the current database row, not the stale cache", async () => {
    h.row = { value: { lateCancelFeeCents: 300, provisionalNotes: "changed elsewhere" }, academy_id: "acad-1" };
    expect(getSettings().lateCancelFeeCents).toBe(200);

    expect(await updateReceiptBusinessSettings(details)).toEqual({ ok: true });
    expect(h.writes).toHaveLength(1);
    const written = h.writes[0].value as Record<string, unknown>;
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
    expect(h.writes).toHaveLength(0);
    expect(getReceiptBusinessSettings().tradingName).toBeNull();
  });

  it("reports a failed write and leaves the cache unchanged", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.writeError = { message: "denied" };
    const res = await updateReceiptBusinessSettings(details);
    expect(res).toEqual({ ok: false, error: "The settings could not be saved. Nothing was changed." });
    expect(getReceiptBusinessSettings().tradingName).toBeNull();
  });
});

/** Simulates another admin's save landing between our read and our write. */
function saveElsewhereAfterNextRead(value: Record<string, unknown>) {
  h.afterRead = () => {
    h.afterRead = null;
    h.row = { ...h.row!, value, updated_at: `v${++h.version}` };
  };
}

describe("concurrent saves", () => {
  it("a receipt save racing a main settings save keeps both changes", async () => {
    saveElsewhereAfterNextRead({ lateCancelFeeCents: 999 });
    expect(await updateReceiptBusinessSettings(details)).toEqual({ ok: true });
    expect(h.writes).toHaveLength(1);
    const written = h.row!.value;
    expect(written.lateCancelFeeCents).toBe(999);
    expect(written.receiptBusiness).toMatchObject({ vatNumber: "IE1234567X" });
  });

  it("a main settings save racing a receipt save keeps the receipt details", async () => {
    saveElsewhereAfterNextRead({ lateCancelFeeCents: 200, receiptBusiness: details });
    await updateSettings({ noShowFeeCents: 800 });
    const written = h.row!.value;
    expect(written.noShowFeeCents).toBe(800);
    expect(written.receiptBusiness).toMatchObject({ tradingName: "Balance Power Motion", vatNumber: "IE1234567X" });
  });

  it("a save from an instance with a stale cache does not revert newer receipt details", async () => {
    expect(getReceiptBusinessSettings().tradingName).toBeNull();
    h.row = { value: { lateCancelFeeCents: 200, receiptBusiness: details }, academy_id: "acad-1", updated_at: "v-other" };
    await updateSettings({ noShowFeeCents: 800 });
    expect(h.row!.value.receiptBusiness).toMatchObject({ vatNumber: "IE1234567X" });
  });

  it("gives up without writing when every attempt loses the race", async () => {
    const keepChanging = () => {
      h.row = { ...h.row!, updated_at: `v${++h.version}` };
    };
    h.afterRead = keepChanging;
    const res = await updateReceiptBusinessSettings(details);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected conflict");
    expect(res.error).toContain("changed by another save");
    expect(h.writes).toHaveLength(0);
    expect(getReceiptBusinessSettings().tradingName).toBeNull();
  });
});
