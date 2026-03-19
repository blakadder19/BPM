/**
 * Settings store — file-backed in development, DB-backed in production.
 *
 * Uses synchronous file I/O so getSettings() can be called from
 * pure domain logic without async. The JSON file lives at .data/settings.json
 * (gitignored). On first access or if the file is missing, defaults are used.
 *
 * In production this would read/write a settings table via Supabase.
 */

import fs from "node:fs";
import path from "node:path";
import {
  LATE_CANCEL_FEE_CENTS,
  NO_SHOW_FEE_CENTS,
  LATE_CANCEL_CUTOFF_MINUTES,
  ALLOWED_ROLE_IMBALANCE,
  STUDENT_PRACTICE_IS_BOOKABLE,
  WAITLIST_OFFER_EXPIRY_HOURS,
} from "@/config/business-rules";
import { DANCE_STYLES } from "@/lib/mock-data";

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

  // Provisional notes
  provisionalNotes: string;
}

const DEFAULT_PROVISIONAL_NOTES = `- Bronze / Silver / Gold membership: exact class/style mapping pending academy confirmation
- Rainbow membership: exact scope pending academy confirmation
- Beginners Latin Combo: two-of-three Beginner 1 mapping pending
- Student Practice: final bookable/penalty rule pending academy confirmation`;

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
    roleBalancedStyleNames: DANCE_STYLES.filter((s) => s.requiresRoleBalance).map(
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

    provisionalNotes: DEFAULT_PROVISIONAL_NOTES,
  };
}

// ── File path ────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), ".data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ── Test detection ───────────────────────────────────────────

const IS_TEST = typeof process !== "undefined" && !!process.env["VITEST"];

// ── Read / Write ─────────────────────────────────────────────

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
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

// ── Public API (same shape as before) ────────────────────────

export function getSettings(): AppSettings {
  return readFromDisk();
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readFromDisk();
  const updated = { ...current, ...patch };
  if (patch.roleBalancedStyleNames) {
    updated.roleBalancedStyleNames = [...patch.roleBalancedStyleNames];
  }
  writeToDisk(updated);
  return { ...updated };
}
