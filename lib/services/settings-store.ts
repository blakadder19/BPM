/**
 * Settings store — Supabase-backed in production, file-backed in local dev.
 *
 * In production (Supabase mode), settings are stored in the `business_rules`
 * table under key `app_settings`. On cold start the row is loaded into a
 * globalThis cache; reads stay synchronous so pure domain logic can call
 * getSettings() without async. Writes merge into the current DB row, upsert
 * it, then update the cache.
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
  TERM_PURCHASE_WINDOW_DAYS,
  CREDIT_DEDUCTION_PRIORITY,
  VAT_ENABLED_DEFAULT,
  VAT_RATE_PERCENT_DEFAULT,
  VAT_PRICE_MODE_DEFAULT,
  VAT_APPLY_TO_ONLINE_DEFAULT,
  VAT_APPLY_TO_MANUAL_DEFAULT,
} from "@/config/business-rules";
import { DEFAULT_BEGINNER_LEVEL_NAMES } from "@/config/class-levels";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import type { ProductType } from "@/types/domain";

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

  // Catalog & Booking (Phase 2B)
  /** Days from term start during which the current term is still purchasable. */
  termPurchaseWindowDays: number;
  /**
   * Order in which a student's subscriptions are considered when deducting
   * a credit. Must contain exactly the 3 known product types (no duplicates,
   * no foreign values) — validated server-side before persisting.
   */
  creditDeductionPriority: ProductType[];
  /**
   * Level names that are treated as "beginner" courses for term-bound late-
   * entry gating (admin can still add students up to week N, students can
   * never self-book once a beginner term has started).
   */
  beginnerLevelNames: string[];
  /**
   * Phase 1: when true, students can book Beginner-level classes for the
   * *next* published term in advance, restricted to the first
   * {@link beginnerIntakeBookingWeeks} weeks of that term. Later weeks
   * stay blocked. Set false to disable advance booking entirely
   * (existing current-term rules are unaffected).
   */
  allowBeginnerNextTermAdvanceBooking: boolean;
  /**
   * Maximum 1-based term week into which a new student can self-book a
   * beginner intake class. Allowed range 1–4 (validated server-side).
   * Default 2 matches the academy's "first two weeks" rule.
   */
  beginnerIntakeBookingWeeks: number;

  // Finance & VAT (Phase 15)
  /**
   * Master switch. When false, every purchase path behaves exactly as
   * it did before VAT existed: no VAT is calculated, no VAT line is
   * rendered, and no VAT columns are written. Default false.
   */
  vatEnabled: boolean;
  /**
   * VAT rate as a percentage. Supports 2 decimal places so reduced
   * rates (Ireland's 13.5%, 9%) work. Validated 0–100 server-side.
   * Never hardcoded anywhere in the codebase.
   */
  vatRatePercent: number;
  /**
   * How to interpret the price stored on a product:
   *   "exclusive" — stored price is NET; VAT is added on top, so the
   *                 customer pays more than the list price.
   *   "inclusive" — stored price is GROSS; the VAT portion is backed
   *                 out of it, so the customer pays the list price.
   */
  vatPriceMode: "exclusive" | "inclusive";
  /** Apply VAT to Stripe/card payments. Default true (once VAT is on). */
  applyVatToOnlinePayments: boolean;
  /**
   * Apply VAT to reception/manual payments (cash, card machine, bank
   * transfer, Revolut, admin assignment). Default FALSE so enabling
   * VAT for online checkout can never silently change what reception
   * charges at the desk.
   */
  applyVatToManualPayments: boolean;

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

    termPurchaseWindowDays: TERM_PURCHASE_WINDOW_DAYS,
    creditDeductionPriority: [...CREDIT_DEDUCTION_PRIORITY],
    beginnerLevelNames: [...DEFAULT_BEGINNER_LEVEL_NAMES],
    allowBeginnerNextTermAdvanceBooking: true,
    beginnerIntakeBookingWeeks: 2,

    vatEnabled: VAT_ENABLED_DEFAULT,
    vatRatePercent: VAT_RATE_PERCENT_DEFAULT,
    vatPriceMode: VAT_PRICE_MODE_DEFAULT,
    applyVatToOnlinePayments: VAT_APPLY_TO_ONLINE_DEFAULT,
    applyVatToManualPayments: VAT_APPLY_TO_MANUAL_DEFAULT,

    disabledAlertIds: [],

    provisionalNotes: "",
  };
}

// ── globalThis cache (survives across requests within one Lambda lifecycle) ──

const g = globalThis as unknown as {
  __bpm_settings?: AppSettings;
  /** True only once settings were read from the database. */
  __bpm_settingsHydrated?: boolean;
  __bpm_settingsHydration?: Promise<void>;
  __bpm_settingsLastFailure?: { at: number; error: SettingsUnavailableError };
  __bpm_settingsAcademyId?: string;
  __bpm_settingsUnhydratedReadWarned?: boolean;
};

/** After a failed load, callers fail fast for this long before the next DB attempt. */
export const SETTINGS_RETRY_COOLDOWN_MS = 2_000;

/**
 * Thrown instead of returning defaults when the configured settings could
 * not be read: defaults differ from production (VAT, fees, booking rules).
 */
export class SettingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsUnavailableError";
  }
}

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
 *
 * Returns null only when the row genuinely does not exist; a failed read
 * throws so it is never mistaken for "no settings saved yet".
 */
async function loadSettingsFromDB(): Promise<Partial<AppSettings> | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("business_rules")
    .select("value, academy_id")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "business_rules read failed");
  }

  if (data) {
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
  if (!client) throw new Error("Supabase is not configured");
  const academyId = g.__bpm_settingsAcademyId;
  if (!academyId) throw new Error("No academy found to save settings for");

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
  if (error) throw new Error(error.message ?? "business_rules write failed");
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

/**
 * Synchronous read of the cached settings.
 *
 * Supabase mode: throws SettingsUnavailableError while a load is in flight
 * or after one failed, rather than serving defaults. Paths that read before
 * any load was attempted keep the legacy defaults fallback (logged once);
 * code that applies business rules uses getLoadedSettings() instead.
 */
export function getSettings(): AppSettings {
  if (!hasSupabaseConfig()) return readFromDisk();
  if (g.__bpm_settingsHydrated && g.__bpm_settings) return g.__bpm_settings;
  if (g.__bpm_settingsHydration || g.__bpm_settingsLastFailure) {
    throw new SettingsUnavailableError("Business settings are not loaded");
  }
  if (!g.__bpm_settingsUnhydratedReadWarned) {
    g.__bpm_settingsUnhydratedReadWarned = true;
    console.warn("[settings-store] getSettings() called before hydrateSettings(); using defaults");
  }
  return readFromDisk();
}

/**
 * Settings for code that applies business rules (pricing/VAT, penalties,
 * credits, check-in, booking and purchase eligibility).
 *
 * Supabase mode: throws SettingsUnavailableError unless settings were read
 * from the database — it never serves defaults, even when no load has been
 * attempted yet. Callers must await hydrateSettings() (directly or through
 * ensureOperationalDataHydrated / ensurePageDataHydrated) first.
 */
export function getLoadedSettings(): AppSettings {
  if (!hasSupabaseConfig()) return readFromDisk();
  if (g.__bpm_settingsHydrated && g.__bpm_settings) return g.__bpm_settings;
  throw new SettingsUnavailableError("Business settings are not loaded");
}

function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const updated = { ...current, ...patch };
  if (patch.roleBalancedStyleNames) {
    updated.roleBalancedStyleNames = [...patch.roleBalancedStyleNames];
  }
  if (patch.disabledAlertIds) {
    updated.disabledAlertIds = [...patch.disabledAlertIds];
  }
  return updated;
}

/**
 * Supabase mode merges the patch into the row as it is in the database
 * right now (never a stale or default cache) and throws if the read or
 * write fails, so a failed save is never reported as success.
 */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  if (!hasSupabaseConfig()) {
    const updated = mergeSettings(readFromDisk(), patch);
    writeToDisk(updated);
    return { ...updated };
  }

  const dbSettings = await loadSettingsFromDB();
  const updated = mergeSettings({ ...defaults(), ...(dbSettings ?? {}) }, patch);
  await saveSettingsToDB(updated);
  g.__bpm_settings = updated;
  g.__bpm_settingsHydrated = true;
  g.__bpm_settingsLastFailure = undefined;
  return { ...updated };
}

// ── Hydration (called from hydrate-operational.ts on cold start) ──

/**
 * Loads settings once per instance. Concurrent callers share the in-flight
 * read. A failed read rejects, leaves the cache unloaded, and is retried by
 * the next call after SETTINGS_RETRY_COOLDOWN_MS.
 */
export async function hydrateSettings(): Promise<void> {
  if (!hasSupabaseConfig() || g.__bpm_settingsHydrated) return;
  if (g.__bpm_settingsHydration) return g.__bpm_settingsHydration;

  const failure = g.__bpm_settingsLastFailure;
  if (failure && Date.now() - failure.at < SETTINGS_RETRY_COOLDOWN_MS) {
    throw failure.error;
  }

  const load = (async () => {
    try {
      const dbSettings = await loadSettingsFromDB();
      // A save that finished while this read was in flight is newer.
      if (!g.__bpm_settingsHydrated) {
        g.__bpm_settings = { ...defaults(), ...(dbSettings ?? {}) };
        g.__bpm_settingsHydrated = true;
      }
      g.__bpm_settingsLastFailure = undefined;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const error = new SettingsUnavailableError(`Business settings could not be loaded: ${message}`);
      g.__bpm_settingsLastFailure = { at: Date.now(), error };
      console.warn("[settings-store] Hydration failed; settings stay unloaded until a retry succeeds:", message);
      throw error;
    }
  })();
  g.__bpm_settingsHydration = load;
  try {
    await load;
  } finally {
    if (g.__bpm_settingsHydration === load) g.__bpm_settingsHydration = undefined;
  }
}

export function resetSettingsHydration(): void {
  g.__bpm_settingsHydrated = false;
  g.__bpm_settingsHydration = undefined;
  g.__bpm_settingsLastFailure = undefined;
  g.__bpm_settings = undefined;
  g.__bpm_settingsAcademyId = undefined;
  g.__bpm_settingsUnhydratedReadWarned = undefined;
}
