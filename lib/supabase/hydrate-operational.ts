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
} from "./operational-persistence";

const g = globalThis as unknown as {
  __bpm_opHydratedBookings?: boolean;
  __bpm_opHydratedAttendance?: boolean;
  __bpm_opHydratedPenalties?: boolean;
  __bpm_opHydratedSubscriptions?: boolean;
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

  const existingBookingIds = new Set(svc.bookings.map((b) => b.id));
  for (const b of dbBookings) {
    if (!existingBookingIds.has(b.id) && isValidStudentId(b.studentId, validIds)) {
      svc.bookings.push(b);
    }
  }

  const existingWaitlistIds = new Set(svc.waitlist.map((w) => w.id));
  for (const w of dbWaitlist) {
    if (!existingWaitlistIds.has(w.id) && isValidStudentId(w.studentId, validIds)) {
      svc.waitlist.push(w);
    }
  }
}

export async function hydrateAttendance(): Promise<void> {
  if (g.__bpm_opHydratedAttendance || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedAttendance = true;

  const svc = getAttendanceService();
  const [dbRecords, validIds] = await Promise.all([
    loadAttendanceFromDB(),
    loadValidUserIds(),
  ]);

  const existingIds = new Set(svc.records.map((r) => r.id));
  for (const r of dbRecords) {
    if (!existingIds.has(r.id) && isValidStudentId(r.studentId, validIds)) {
      svc.records.push(r);
    }
  }
}

export async function hydratePenalties(): Promise<void> {
  if (g.__bpm_opHydratedPenalties || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedPenalties = true;

  const svc = getPenaltyService();
  const [dbPenalties, validIds] = await Promise.all([
    loadPenaltiesFromDB(),
    loadValidUserIds(),
  ]);

  const existingIds = new Set(svc.penalties.map((p) => p.id));
  for (const p of dbPenalties) {
    if (!existingIds.has(p.id) && isValidStudentId(p.studentId, validIds)) {
      svc.penalties.push(p);
    }
  }
}

export async function hydrateSubscriptions(): Promise<void> {
  if (g.__bpm_opHydratedSubscriptions || !hasSupabaseConfig()) return;
  g.__bpm_opHydratedSubscriptions = true;

  const store = getSubscriptions();
  const [dbSubs, validIds] = await Promise.all([
    loadSubscriptionsFromDB(),
    loadValidUserIds(),
  ]);

  const existingIds = new Set(store.map((s) => s.id));
  for (const s of dbSubs) {
    if (!existingIds.has(s.id) && isValidStudentId(s.studentId, validIds)) {
      store.push(s);
    }
  }
}

/**
 * Hydrate all operational services from Supabase.
 * Safe to call multiple times — each service only loads once per server lifecycle.
 */
export async function ensureOperationalDataHydrated(): Promise<void> {
  await Promise.all([
    hydrateBookings(),
    hydrateAttendance(),
    hydratePenalties(),
    hydrateSubscriptions(),
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
  g.__bpm_validUserIds = undefined;
}
