/**
 * Hydration layer: loads real-user operational data from Supabase
 * into the in-memory services on first access. Uses a globalThis
 * flag per service to avoid redundant loads.
 *
 * Orphan protection: loads the set of current valid user IDs from
 * public.users and excludes operational records whose studentId
 * does not match any current user. This prevents data from deleted/
 * recreated users from polluting active views.
 */

import { createClient } from "@supabase/supabase-js";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSubscriptions } from "@/lib/services/subscription-store";
import { isRealUser } from "@/lib/utils/is-real-user";
import {
  loadBookingsFromDB,
  loadWaitlistFromDB,
  loadAttendanceFromDB,
  loadPenaltiesFromDB,
  loadSubscriptionsFromDB,
  loadStudioHiresFromDB,
} from "./operational-persistence";
import { getStudioHireService } from "@/lib/services/studio-hire-store";
import { ensureScheduleBootstrapped } from "@/lib/services/schedule-bootstrap";
import { hydrateSettings, resetSettingsHydration } from "@/lib/services/settings-store";

const g = globalThis as unknown as {
  __bpm_opHydratedBookings?: boolean;
  __bpm_opHydratedAttendance?: boolean;
  __bpm_opHydratedPenalties?: boolean;
  __bpm_opHydratedSubscriptions?: boolean;
  __bpm_opHydratedStudioHires?: boolean;
  __bpm_validUserIds?: Set<string>;
};

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function loadValidUserIds(): Promise<Set<string>> {
  if (g.__bpm_validUserIds) return g.__bpm_validUserIds;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Set();
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.from("users").select("id");
    if (error || !data) return new Set();
    const ids = new Set(data.map((r: { id: string }) => r.id));
    g.__bpm_validUserIds = ids;
    return ids;
  } catch {
    return new Set();
  }
}

function isValidStudentId(id: string, validIds: Set<string>): boolean {
  if (!isRealUser(id)) return true; // mock IDs always pass
  return validIds.has(id);
}

export async function hydrateBookings(): Promise<void> {
  if (g.__bpm_opHydratedBookings || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedBookings = true;

  const svc = getBookingService();
  const [dbBookings, dbWaitlist, validIds] = await Promise.all([
    loadBookingsFromDB(),
    loadWaitlistFromDB(),
    loadValidUserIds(),
  ]);

  const validBookings = dbBookings.filter((b) => isValidStudentId(b.studentId, validIds));
  const validWaitlist = dbWaitlist.filter((w) => isValidStudentId(w.studentId, validIds));

  svc.bookings.length = 0;
  svc.bookings.push(...validBookings);

  svc.waitlist.length = 0;
  svc.waitlist.push(...validWaitlist);
}

export async function hydrateAttendance(): Promise<void> {
  if (g.__bpm_opHydratedAttendance || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedAttendance = true;

  const svc = getAttendanceService();
  const [dbRecords, validIds] = await Promise.all([
    loadAttendanceFromDB(),
    loadValidUserIds(),
  ]);

  const valid = dbRecords.filter((r) => isValidStudentId(r.studentId, validIds));
  svc.records.length = 0;
  svc.records.push(...valid);
}

export async function hydratePenalties(): Promise<void> {
  if (g.__bpm_opHydratedPenalties || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedPenalties = true;

  const svc = getPenaltyService();
  const [dbPenalties, validIds] = await Promise.all([
    loadPenaltiesFromDB(),
    loadValidUserIds(),
  ]);

  const valid = dbPenalties.filter((p) => isValidStudentId(p.studentId, validIds));
  svc.penalties.length = 0;
  svc.penalties.push(...valid);
}

export async function hydrateSubscriptions(): Promise<void> {
  if (g.__bpm_opHydratedSubscriptions || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedSubscriptions = true;

  const store = getSubscriptions();
  const [dbSubs, validIds] = await Promise.all([
    loadSubscriptionsFromDB(),
    loadValidUserIds(),
  ]);

  const valid = dbSubs.filter((s) => isValidStudentId(s.studentId, validIds));
  store.length = 0;
  store.push(...valid);
}

export async function hydrateStudioHires(): Promise<void> {
  if (g.__bpm_opHydratedStudioHires || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedStudioHires = true;

  const svc = getStudioHireService();
  const dbEntries = await loadStudioHiresFromDB();
  svc.entries.length = 0;
  svc.entries.push(...dbEntries);
}

/**
 * Hydrate all operational services from Supabase.
 * Safe to call multiple times — each service only loads once per server lifecycle.
 */
export async function ensureOperationalDataHydrated(): Promise<void> {
  // Settings must hydrate first — other stores may call getSettings() during
  // request handling, so the cache must be warm before any page renders.
  await hydrateSettings();

  await Promise.all([
    ensureScheduleBootstrapped(),
    hydrateBookings(),
    hydrateAttendance(),
    hydratePenalties(),
    hydrateSubscriptions(),
    hydrateStudioHires(),
  ]);
}

/**
 * Reset hydration flags. Called when stores are re-created (e.g. HMR version bump).
 */
export function resetHydrationFlags(): void {
  g.__bpm_opHydratedBookings = false;
  g.__bpm_opHydratedAttendance = false;
  g.__bpm_opHydratedPenalties = false;
  g.__bpm_opHydratedSubscriptions = false;
  g.__bpm_opHydratedStudioHires = false;
  g.__bpm_validUserIds = undefined;
  resetSettingsHydration();
}
