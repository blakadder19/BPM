import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Operational stores call resetHydrationFlags() when they are created —
 * on a cold instance that happens inside the hydration that has just
 * loaded business settings. It must not discard those settings: doing so
 * made the first renders on every new instance read business rules that
 * were "not loaded" (and, before fail-closed reads, silently use defaults).
 */

const h = vi.hoisted(() => ({ settingsReads: 0, bookingLoads: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/dance-style-store", () => ({ getDanceStyles: () => [] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            h.settingsReads += 1;
            return {
              data: {
                value: { vatEnabled: true, vatRatePercent: 23, attendanceClosureMinutes: 45 },
                academy_id: "acad-1",
              },
              error: null,
            };
          },
        }),
        limit: () => ({
          maybeSingle: async () => ({ data: table === "academies" ? { id: "acad-1" } : null, error: null }),
        }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      }),
      upsert: async () => ({ error: null }),
    }),
  }),
}));
vi.mock("../operational-persistence", () => ({
  loadBookingsFromDB: async () => {
    h.bookingLoads += 1;
    return [];
  },
  loadWaitlistFromDB: async () => [],
  loadAttendanceFromDB: async () => [],
  loadPenaltiesFromDB: async () => [],
  loadStudioHiresFromDB: async () => [],
  loadAuditLogFromDB: async () => [],
}));
vi.mock("@/lib/services/schedule-bootstrap", () => ({ ensureScheduleBootstrapped: async () => {} }));
vi.mock("@/lib/repositories/supabase/schedule-repository", () => ({
  supabaseScheduleRepo: { getInstances: async () => [] },
}));

import {
  ensureOperationalDataHydrated,
  invalidateHydration,
  resetHydrationFlags,
} from "../hydrate-operational";
import { getLoadedSettings, resetSettingsHydration } from "@/lib/services/settings-store";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  resetSettingsHydration();
  invalidateHydration();
  h.settingsReads = 0;
  h.bookingLoads = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("store re-creation during hydration", () => {
  it("keeps the loaded business settings", async () => {
    await ensureOperationalDataHydrated();
    resetHydrationFlags();
    const settings = getLoadedSettings();
    expect(settings.vatEnabled).toBe(true);
    expect(settings.vatRatePercent).toBe(23);
    expect(settings.attendanceClosureMinutes).toBe(45);
  });

  it("forces the next hydration to re-read operational data", async () => {
    await ensureOperationalDataHydrated();
    expect(h.bookingLoads).toBe(1);
    resetHydrationFlags();
    await ensureOperationalDataHydrated();
    expect(h.bookingLoads).toBe(2);
    expect(h.settingsReads).toBe(1);
  });
});
