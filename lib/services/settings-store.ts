/**
 * Settings store — Supabase-backed in production, file-backed in local dev.
 *
 * In production (Supabase mode), settings are stored in the `business_rules`
 * table under key `app_settings`. On cold start the row is loaded into a
 * globalThis cache; reads stay synchronous so pure domain logic can call
 * getSettings() without async. Writes update the cache and fire-and-forget
 * a DB upsert.
 *
 * In local dev (memory mode / no Supabase config), settings fall back to
 * .data/settings.json on disk.
 *
 * SERVER-ONLY — must never be imported by client components.
 */

import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  LATE_CANCEL_FEE_CENTS,
  NO_SHOW_FEE_CENTS,
  LATE_CANCEL_CUTOFF_MINUTES,
  ALLOWED_ROLE_IMBALANCE,
  STUDENT_PRACTICE_IS_BOOKABLE,
  WAITLIST_OFFER_EXPIRY_HOURS,
} from "@/config/business-rules";
import { getDanceStyles } from "@/lib/services/dance-style-store";

export interface AppSettings {
  // Penalty rules
  lateCancelFeeCents: number;
  noShowFeeCents: number;
  lateCancelCutoffMinutes: number;
  lateCancelPenaltiesEnabled: boolean;
  noShowPenaltiesEnabled: boolean;
  penaltiesApplyToClassOnly: boolean;
  socialsExcludedFromPenalties: boolean;

  // Role balance
  allowedRoleImbalance: number;
  roleBalancedStyleNames: string[];

  // Class availability
  socialsBookable: boolean;
  weeklyEventsBookable: boolean;
  studentPracticeBookable: boolean;

  // Waitlist
  waitlistOfferExpiryHours: number;

  // Attendance & Check-in
  attendanceClosureMinutes: number;
  selfCheckInEnabled: boolean;
  selfCheckInOpensMinutesBefore: number;
  qrCheckInEnabled: boolean;

  // Absence policy
  refundCreditOnAbsent: boolean;

  // Term-bound policy
  allowAdminLateEntryIntoTermBound: boolean;
  adminLateEntryMaxClassNumber: number;
  studentTermSelectionEnabled: boolean;

  // Admin alert preferences
  disabledAlertIds: string[];

  // Provisional notes
  provisionalNotes: string;
}

function defaults(): AppSettings {
  return {
    lateCancelFeeCents: LATE_CANCEL_FEE_CENTS,
    noShowFeeCents: NO_SHOW_FEE_CENTS,
    lateCancelCutoffMinutes: LATE_CANCEL_CUTOFF_MINUTES,
    lateCancelPenaltiesEnabled: true,
    noShowPenaltiesEnabled: false,
    penaltiesApplyToClassOnly: true,
    socialsExcludedFromPenalties: true,

    allowedRoleImbalance: ALLOWED_ROLE_IMBALANCE,
    roleBalancedStyleNames: getDanceStyles().filter((s) => s.requiresRoleBalance).map(
      (s) => s.name
    ),

    socialsBookable: false,
    weeklyEventsBookable: false,
    studentPracticeBookable: STUDENT_PRACTICE_IS_BOOKABLE,

    waitlistOfferExpiryHours: WAITLIST_OFFER_EXPIRY_HOURS,

    attendanceClosureMinutes: 60,
    selfCheckInEnabled: true,
    selfCheckInOpensMinutesBefore: 15,
    qrCheckInEnabled: true,

    refundCreditOnAbsent: false,

    allowAdminLateEntryIntoTermBound: true,
    adminLateEntryMaxClassNumber: 2,
    studentTermSelectionEnabled: true,

    disabledAlertIds: [],

    provisionalNotes: "",
  };
}

// ── globalThis cache (survives across requests within one Lambda lifecycle) ──

const g = globalThis as unknown as {
  __bpm_settings?: AppSettings;
  __bpm_settingsHydrated?: boolean;
  __bpm_settingsAcademyId?: string;
};

// ── Supabase helpers ─────────────────────────────────────────

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _settingsClient: any = null;

function getSupabaseClient() {
  if (_settingsClient) return _settingsClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _settingsClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _settingsClient;
}

const SETTINGS_KEY = "app_settings";

/**
 * Load the full AppSettings blob from business_rules.
 * Also resolves the academy_id for future writes.
 */
async function loadSettingsFromDB(): Promise<Partial<AppSettings> | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("business_rules")
    .select("value, academy_id")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (!error && data) {
    g.__bpm_settingsAcademyId = data.academy_id;
    return data.value as Partial<AppSettings>;
  }

  // No settings row yet — resolve academy_id for the first write
  if (!g.__bpm_settingsAcademyId) {
    const { data: academy } = await client
      .from("academies")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (academy) g.__bpm_settingsAcademyId = academy.id;
  }

  return null;
}

async function saveSettingsToDB(settings: AppSettings): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const academyId = g.__bpm_settingsAcademyId;
  if (!academyId) return;

  try {
    const { error } = await client
      .from("business_rules")
      .upsert(
        {
          academy_id: academyId,
          key: SETTINGS_KEY,
          value: settings as unknown as Record<string, unknown>,
          description: "Full app settings blob (managed by Settings page)",
        },
        { onConflict: "academy_id,key" }
      );
    if (error) console.warn("[settings-store] DB write failed:", error.message);
  } catch (e) {
    console.warn("[settings-store] DB write error:", e instanceof Error ? e.message : e);
  }
}

// ── File-based fallback (local dev / memory mode) ────────────

const DATA_DIR = path.join(process.cwd(), ".data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const IS_TEST = typeof process !== "undefined" && !!process.env["VITEST"];

function readFromDisk(): AppSettings {
  if (IS_TEST) return defaults();
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}

function writeToDisk(settings: AppSettings): void {
  if (IS_TEST) return;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

// ── Public API ───────────────────────────────────────────────

export function getSettings(): AppSettings {
  if (hasSupabaseConfig() && g.__bpm_settingsHydrated) {
    return g.__bpm_settings ?? defaults();
  }
  return readFromDisk();
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = getSettings();
  const updated = { ...current, ...patch };
  if (patch.roleBalancedStyleNames) {
    updated.roleBalancedStyleNames = [...patch.roleBalancedStyleNames];
  }
  if (patch.disabledAlertIds) {
    updated.disabledAlertIds = [...patch.disabledAlertIds];
  }

  if (hasSupabaseConfig()) {
    g.__bpm_settings = updated;
    await saveSettingsToDB(updated);
  } else {
    writeToDisk(updated);
  }

  return { ...updated };
}

// ── Hydration (called from hydrate-operational.ts on cold start) ──

export async function hydrateSettings(): Promise<void> {
  if (g.__bpm_settingsHydrated || !hasSupabaseConfig()) return;
  g.__bpm_settingsHydrated = true;

  try {
    const dbSettings = await loadSettingsFromDB();
    g.__bpm_settings = dbSettings
      ? { ...defaults(), ...dbSettings }
      : defaults();
  } catch (e) {
    console.warn("[settings-store] Hydration failed, using defaults:", e instanceof Error ? e.message : e);
    g.__bpm_settings = defaults();
  }
}

export function resetSettingsHydration(): void {
  g.__bpm_settingsHydrated = false;
  g.__bpm_settings = undefined;
  g.__bpm_settingsAcademyId = undefined;
}
