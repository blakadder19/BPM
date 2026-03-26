/**
 * Hydration layer: loads operational data from Supabase into in-memory
 * services. Operational data (bookings, waitlist, attendance, penalties,
 * subscriptions, class instances) is re-read from Supabase on EVERY
 * request to guarantee consistency across Vercel serverless instances.
 *
 * Reference data (settings, dance styles, templates) is cached per
 * instance lifecycle since it changes infrequently.
 *
 * Orphan protection: loads valid user IDs from public.users and excludes
 * operational records whose studentId doesn't match.
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

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function loadValidUserIds(): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Set();
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.from("users").select("id");
    if (error || !data) return new Set();
    return new Set(data.map((r: { id: string }) => r.id));
  } catch {
    return new Set();
  }
}

function isValidStudentId(id: string, validIds: Set<string>): boolean {
  if (!isRealUser(id)) return true;
  return validIds.has(id);
}

/**
 * Re-read all operational data from Supabase and replace in-memory stores.
 * Called on every request to ensure cross-instance consistency.
 */
async function refreshOperationalData(): Promise<void> {
  const [bookings, waitlist, attendance, penalties, subs, studioHires, validIds] = await Promise.all([
    loadBookingsFromDB(),
    loadWaitlistFromDB(),
    loadAttendanceFromDB(),
    loadPenaltiesFromDB(),
    loadSubscriptionsFromDB(),
    loadStudioHiresFromDB(),
    loadValidUserIds(),
  ]);

  const bookingSvc = getBookingService();
  bookingSvc.bookings.length = 0;
  bookingSvc.bookings.push(...bookings.filter((b) => isValidStudentId(b.studentId, validIds)));
  bookingSvc.waitlist.length = 0;
  bookingSvc.waitlist.push(...waitlist.filter((w) => isValidStudentId(w.studentId, validIds)));

  const attSvc = getAttendanceService();
  attSvc.records.length = 0;
  attSvc.records.push(...attendance.filter((r) => isValidStudentId(r.studentId, validIds)));

  const penSvc = getPenaltyService();
  penSvc.penalties.length = 0;
  penSvc.penalties.push(...penalties.filter((p) => isValidStudentId(p.studentId, validIds)));

  const subStore = getSubscriptions();
  subStore.length = 0;
  subStore.push(...subs.filter((s) => isValidStudentId(s.studentId, validIds)));

  const hireSvc = getStudioHireService();
  hireSvc.entries.length = 0;
  hireSvc.entries.push(...studioHires);
}

/**
 * Re-read class instances from Supabase. Runs after schedule bootstrap
 * so that cached templates are available for the termBound merge.
 */
async function refreshClassInstances(): Promise<void> {
  try {
    const { supabaseScheduleRepo } = require("@/lib/repositories/supabase/schedule-repository");
    const instances = await supabaseScheduleRepo.getInstances();

    const { getTemplates } = require("@/lib/services/class-store");
    const templates = getTemplates();
    const tmplById = new Map<string, { id: string; termBound?: boolean }>(
      templates.map((t: { id: string; termBound?: boolean }) => [t.id, t])
    );

    for (const inst of instances) {
      if (inst.termBound === undefined) {
        const tmpl = inst.classId ? tmplById.get(inst.classId) : null;
        if (tmpl) inst.termBound = tmpl.termBound;
      }
    }

    const scheduleStore = require("@/lib/services/schedule-store");
    scheduleStore.replaceInstances(instances);
  } catch (err) {
    console.warn("[hydrate] instance refresh failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Hydrate all services from Supabase.
 *
 * Reference data (settings, schedule templates, dance styles) is cached
 * per serverless instance lifecycle.
 *
 * Operational data (bookings, waitlist, attendance, penalties,
 * subscriptions, class instances) is ALWAYS re-read from Supabase
 * to guarantee consistency across Vercel serverless instances.
 */
export async function ensureOperationalDataHydrated(): Promise<void> {
  if (!hasSupabaseConfig()) return;

  // 1. Reference data — cached per instance (changes infrequently)
  await hydrateSettings();
  await ensureScheduleBootstrapped();

  // 2. Operational data — ALWAYS re-read from Supabase.
  //    Different Vercel instances may have written since our last read.
  await Promise.all([
    refreshOperationalData(),
    refreshClassInstances(),
  ]);
}

/**
 * Reset hydration flags. Called when stores are re-created (e.g. HMR version bump).
 */
export function resetHydrationFlags(): void {
  resetSettingsHydration();
}
