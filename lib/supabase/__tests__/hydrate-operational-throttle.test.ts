import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const loads = vi.hoisted(() => ({ bookings: vi.fn(async () => []) }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  }),
}));
vi.mock("../operational-persistence", () => ({
  loadBookingsFromDB: loads.bookings,
  loadWaitlistFromDB: async () => [],
  loadAttendanceFromDB: async () => [],
  loadPenaltiesFromDB: async () => [],
  loadStudioHiresFromDB: async () => [],
  loadAuditLogFromDB: async () => [],
}));
vi.mock("@/lib/services/booking-store", () => ({
  getBookingService: () => ({ bookings: [], waitlist: [] }),
}));
vi.mock("@/lib/services/attendance-store", () => ({
  getAttendanceService: () => ({ records: [] }),
}));
vi.mock("@/lib/services/penalty-store", () => ({
  getPenaltyService: () => ({ penalties: [] }),
}));
vi.mock("@/lib/services/studio-hire-store", () => ({
  getStudioHireService: () => ({ entries: [] }),
}));
vi.mock("@/lib/services/finance-audit-log", () => ({ hydrateAuditLog: () => {} }));
vi.mock("@/lib/services/schedule-bootstrap", () => ({ ensureScheduleBootstrapped: async () => {} }));
vi.mock("@/lib/services/settings-store", () => ({
  hydrateSettings: async () => {},
  resetSettingsHydration: () => {},
}));
vi.mock("@/lib/repositories/supabase/schedule-repository", () => ({
  supabaseScheduleRepo: { getInstances: async () => [] },
}));
vi.mock("@/lib/services/class-store", () => ({ getTemplates: () => [] }));
vi.mock("@/lib/services/schedule-store", () => ({ replaceInstances: () => {} }));

import {
  ensureOperationalDataHydrated,
  ensurePageDataHydrated,
  invalidateHydration,
  PAGE_HYDRATE_MAX_AGE_MS,
} from "../hydrate-operational";

describe("operational hydration freshness", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T19:00:00Z"));
    invalidateHydration();
    loads.bookings.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("page renders reuse data younger than the page window", async () => {
    await ensurePageDataHydrated();
    vi.advanceTimersByTime(PAGE_HYDRATE_MAX_AGE_MS - 1);
    await ensurePageDataHydrated();
    expect(loads.bookings).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await ensurePageDataHydrated();
    expect(loads.bookings).toHaveBeenCalledTimes(2);
  });

  it("server actions still re-read after 2s even when a page hydrated recently", async () => {
    await ensurePageDataHydrated();
    vi.advanceTimersByTime(1_999);
    await ensureOperationalDataHydrated();
    expect(loads.bookings).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await ensureOperationalDataHydrated();
    expect(loads.bookings).toHaveBeenCalledTimes(2);
  });

  it("invalidation forces the next page render to re-read", async () => {
    await ensurePageDataHydrated();
    invalidateHydration();
    await ensurePageDataHydrated();
    expect(loads.bookings).toHaveBeenCalledTimes(2);
  });
});
