/**
 * Phase 13 — repo-level round-trip test for the new
 * `isMarketingLanding` per-event flag.
 *
 * Covers three invariants we rely on end-to-end:
 *   1. Newly-created events default to `false` when the admin form
 *      doesn't tick the checkbox (i.e. when the field is omitted
 *      from `CreateEventData`).
 *   2. A create with `isMarketingLanding: true` round-trips through
 *      the memory repo (proves the CreateEventData → repo → store
 *      wiring on both the interface AND the mock implementation).
 *   3. An update patching only `isMarketingLanding` from `false` →
 *      `true` (and back) persists correctly and doesn't clobber the
 *      other event fields — this is the exact code path the
 *      `updateEventAction` uses in prod.
 *
 * Uses `memorySpecialEventRepo` on purpose. The Supabase-backed repo
 * is untestable from vitest without a live DB, and the interface
 * guarantees a single mapping, so exercising the memory branch also
 * exercises the shared type contract.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// The store hangs off `globalThis.__bpm_specialEvents`. Reset per-test
// so seed data from mock-data doesn't leak between cases.
beforeEach(() => {
  const g = globalThis as unknown as { [key: string]: unknown };
  delete g.__bpm_specialEvents;
  delete g.__bpm_eventSessions;
  delete g.__bpm_eventProducts;
  delete g.__bpm_eventPurchases;
});

// Force the memory backend regardless of whatever the runtime data-
// provider config decides (Supabase mode would still fall back to
// this repo when called directly, but this makes intent explicit).
vi.mock("@/lib/config/data-provider", () => ({
  isSupabaseMode: () => false,
}));

// Local import comes AFTER the mocks above so the mock resolves.
// eslint-disable-next-line import/first
import { memorySpecialEventRepo } from "@/lib/repositories/memory/special-event-repository";

const BASE = {
  title: "Beginner Bachata Bootcamp",
  description: "",
  location: "BPM Dance Academy",
  startDate: "2026-11-01T18:00:00",
  endDate: "2026-11-01T21:00:00",
};

describe("memorySpecialEventRepo — isMarketingLanding round-trip", () => {
  it("defaults to false when the field is omitted", async () => {
    const created = await memorySpecialEventRepo.createEvent({ ...BASE });
    expect(created.isMarketingLanding).toBe(false);
    // Read-back path (getEventById) must agree — this is the exact
    // hydration the public page uses.
    const fetched = await memorySpecialEventRepo.getEventById(created.id);
    expect(fetched?.isMarketingLanding).toBe(false);
  });

  it("persists `isMarketingLanding: true` when set on create", async () => {
    const created = await memorySpecialEventRepo.createEvent({
      ...BASE,
      title: "New-Beginner Salsa Intake",
      isMarketingLanding: true,
    });
    expect(created.isMarketingLanding).toBe(true);
    const fetched = await memorySpecialEventRepo.getEventById(created.id);
    expect(fetched?.isMarketingLanding).toBe(true);
  });

  it("toggles from false → true via updateEvent (checkbox tick)", async () => {
    const created = await memorySpecialEventRepo.createEvent({ ...BASE });
    expect(created.isMarketingLanding).toBe(false);
    const patched = await memorySpecialEventRepo.updateEvent(created.id, {
      isMarketingLanding: true,
    });
    expect(patched?.isMarketingLanding).toBe(true);
    // And the other fields are still exactly what we created.
    expect(patched?.title).toBe(BASE.title);
    expect(patched?.location).toBe(BASE.location);
  });

  it("toggles from true → false via updateEvent (checkbox untick)", async () => {
    const created = await memorySpecialEventRepo.createEvent({
      ...BASE,
      isMarketingLanding: true,
    });
    expect(created.isMarketingLanding).toBe(true);
    const patched = await memorySpecialEventRepo.updateEvent(created.id, {
      isMarketingLanding: false,
    });
    expect(patched?.isMarketingLanding).toBe(false);
  });

  it("does not touch isMarketingLanding when the patch omits it", async () => {
    const created = await memorySpecialEventRepo.createEvent({
      ...BASE,
      isMarketingLanding: true,
    });
    // Patch a different field — the flag must survive.
    const patched = await memorySpecialEventRepo.updateEvent(created.id, {
      title: "Renamed event",
    });
    expect(patched?.title).toBe("Renamed event");
    expect(patched?.isMarketingLanding).toBe(true);
  });
});
