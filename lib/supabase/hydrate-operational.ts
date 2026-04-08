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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null;

function getAdminClient() {
  if (_adminClient) return _adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _adminClient;
}

async function loadValidUserIds(): Promise<Set<string>> {
  const client = getAdminClient();
  if (!client) return new Set();
  try {
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

let _validIdsCache: Set<string> | null = null;
let _validIdsCachedAt = 0;
const VALID_IDS_TTL_MS = 60_000;

async function loadValidUserIdsCached(): Promise<Set<string>> {
  const now = Date.now();
  if (_validIdsCache && now - _validIdsCachedAt < VALID_IDS_TTL_MS) {
    return _validIdsCache;
  }
  _validIdsCache = await loadValidUserIds();
  _validIdsCachedAt = now;
  return _validIdsCache;
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
    loadValidUserIdsCached(),
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

let _lastHydratedAt = 0;
let _hydratePromise: Promise<void> | null = null;
const HYDRATE_THROTTLE_MS = 2_000;

/**
 * Hydrate all services from Supabase.
 *
 * Reference data (settings, schedule templates, dance styles) is cached
 * per serverless instance lifecycle.
 *
 * Operational data (bookings, waitlist, attendance, penalties,
 * subscriptions, class instances) is re-read from Supabase, but
 * throttled to avoid redundant queries within the same request cycle.
 */
export async function ensureOperationalDataHydrated(): Promise<void> {
  if (!hasSupabaseConfig()) return;

  const now = Date.now();
  if (now - _lastHydratedAt < HYDRATE_THROTTLE_MS) return;

  if (_hydratePromise) return _hydratePromise;

  _hydratePromise = (async () => {
    try {
      await hydrateSettings();
      await ensureScheduleBootstrapped();

      await Promise.all([
        refreshOperationalData(),
        refreshClassInstances(),
      ]);

      _lastHydratedAt = Date.now();
    } finally {
      _hydratePromise = null;
    }
  })();

  return _hydratePromise;
}

/**
 * Invalidate hydration timestamp so the next request triggers a full re-read.
 * Call after any admin mutation that should be visible to other roles immediately.
 */
export function invalidateHydration(): void {
  _lastHydratedAt = 0;
}

/**
 * Reset hydration flags. Called when stores are re-created (e.g. HMR version bump).
 */
export function resetHydrationFlags(): void {
  resetSettingsHydration();
}
