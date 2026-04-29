"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import {
  getSettings,
  updateSettings,
  type AppSettings,
} from "@/lib/services/settings-store";
import { DANCE_STYLES } from "@/lib/mock-data";
import { CLASS_LEVEL_NAMES } from "@/config/class-levels";
import type { ProductType } from "@/types/domain";

const VALID_STYLE_NAMES = new Set(DANCE_STYLES.map((s) => s.name));
const VALID_CLASS_LEVELS = new Set(CLASS_LEVEL_NAMES);
const VALID_DEDUCTION_TYPES: readonly ProductType[] = ["pass", "drop_in", "membership"];

/**
 * Validate that a credit-deduction priority list is a permutation of the
 * 3 known product types — no duplicates, no foreign values. Returns the
 * validated list or null if invalid.
 */
function validateCreditDeductionPriority(
  raw: string[],
): ProductType[] | null {
  const allowed = new Set(VALID_DEDUCTION_TYPES);
  if (raw.length !== VALID_DEDUCTION_TYPES.length) return null;
  if (new Set(raw).size !== raw.length) return null;
  for (const t of raw) {
    if (!allowed.has(t as ProductType)) return null;
  }
  return raw as ProductType[];
}

export async function saveSettings(
  formData: FormData
): Promise<{ success: boolean; settings: AppSettings; error?: string }> {
  const guard = await requirePermissionForAction("settings:edit");
  if (!guard.ok) {
    // Return a minimal failure shape that the existing caller already
    // handles (success=false / error).
    return { success: false, settings: {} as AppSettings, error: guard.error };
  }
  // --- Numbers ---
  const numericFields = {
    lateCancelFeeCents: Number(formData.get("lateCancelFeeCents")),
    noShowFeeCents: Number(formData.get("noShowFeeCents")),
    lateCancelCutoffMinutes: Number(formData.get("lateCancelCutoffMinutes")),
    allowedRoleImbalance: Number(formData.get("allowedRoleImbalance")),
    waitlistOfferExpiryHours: Number(formData.get("waitlistOfferExpiryHours")),
  };

  for (const [key, val] of Object.entries(numericFields)) {
    if (isNaN(val) || val < 0) {
      return {
        success: false,
        settings: getSettings(),
        error: `Invalid value for ${key}`,
      };
    }
  }

  // --- Attendance numeric fields ---
  const attendanceNumeric = {
    attendanceClosureMinutes: Number(formData.get("attendanceClosureMinutes")) || 60,
    selfCheckInOpensMinutesBefore: Number(formData.get("selfCheckInOpensMinutesBefore")) || 15,
    adminLateEntryMaxClassNumber: Number(formData.get("adminLateEntryMaxClassNumber")) || 2,
  };

  // --- Catalog & Booking numeric fields (Phase 2B) ---
  const termPurchaseWindowDaysRaw = Number(formData.get("termPurchaseWindowDays"));
  if (
    isNaN(termPurchaseWindowDaysRaw) ||
    termPurchaseWindowDaysRaw < 0 ||
    termPurchaseWindowDaysRaw > 60
  ) {
    return {
      success: false,
      settings: getSettings(),
      error: "Term purchase window must be between 0 and 60 days",
    };
  }
  const termPurchaseWindowDays = Math.floor(termPurchaseWindowDaysRaw);

  // --- Credit deduction priority (Phase 2B) ---
  const rawPriority = formData.getAll("creditDeductionPriority") as string[];
  const validatedPriority = validateCreditDeductionPriority(rawPriority);
  if (!validatedPriority) {
    return {
      success: false,
      settings: getSettings(),
      error:
        "Credit deduction priority must include each of pass, drop_in, and membership exactly once",
    };
  }

  // --- Beginner level names (Phase 2B) ---
  const rawBeginnerLevels = formData.getAll("beginnerLevelNames") as string[];
  const beginnerLevelNames = rawBeginnerLevels.filter((l) =>
    VALID_CLASS_LEVELS.has(l),
  );

  // --- Booleans (checkbox: present = "on" = true, absent = false) ---
  const booleanFields = {
    lateCancelPenaltiesEnabled: formData.get("lateCancelPenaltiesEnabled") === "on",
    noShowPenaltiesEnabled: formData.get("noShowPenaltiesEnabled") === "on",
    penaltiesApplyToClassOnly: formData.get("penaltiesApplyToClassOnly") === "on",
    socialsExcludedFromPenalties: formData.get("socialsExcludedFromPenalties") === "on",
    socialsBookable: formData.get("socialsBookable") === "on",
    weeklyEventsBookable: formData.get("weeklyEventsBookable") === "on",
    studentPracticeBookable: formData.get("studentPracticeBookable") === "on",
    selfCheckInEnabled: formData.get("selfCheckInEnabled") === "on",
    qrCheckInEnabled: formData.get("qrCheckInEnabled") === "on",
    refundCreditOnAbsent: formData.get("refundCreditOnAbsent") === "on",
    allowAdminLateEntryIntoTermBound: formData.get("allowAdminLateEntryIntoTermBound") === "on",
    studentTermSelectionEnabled: formData.get("studentTermSelectionEnabled") === "on",
  };

  // --- Role balanced style names (multi-checkbox) ---
  const rawStyles = formData.getAll("roleBalancedStyleNames") as string[];
  const roleBalancedStyleNames = rawStyles.filter((s) => VALID_STYLE_NAMES.has(s));

  // --- Disabled alert IDs (multi-checkbox) ---
  const disabledAlertIds = formData.getAll("disabledAlertIds") as string[];

  // --- Provisional notes ---
  const provisionalNotes = ((formData.get("provisionalNotes") as string) ?? "").trim();

  const patch: Partial<AppSettings> = {
    ...numericFields,
    ...attendanceNumeric,
    ...booleanFields,
    roleBalancedStyleNames,
    disabledAlertIds,
    provisionalNotes,
    termPurchaseWindowDays,
    creditDeductionPriority: validatedPriority,
    beginnerLevelNames,
  };

  const updated = await updateSettings(patch);
  revalidatePath("/settings");
  revalidatePath("/penalties");
  revalidatePath("/catalog");
  revalidatePath("/classes");
  return { success: true, settings: updated };
}
