"use server";

import { revalidatePath } from "next/cache";
import {
  getSettings,
  updateSettings,
  type AppSettings,
} from "@/lib/services/settings-store";
import { DANCE_STYLES } from "@/lib/mock-data";

const VALID_STYLE_NAMES = new Set(DANCE_STYLES.map((s) => s.name));

export async function saveSettings(
  formData: FormData
): Promise<{ success: boolean; settings: AppSettings; error?: string }> {
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

  // --- Booleans (checkbox: present = "on" = true, absent = false) ---
  const booleanFields = {
    lateCancelPenaltiesEnabled: formData.get("lateCancelPenaltiesEnabled") === "on",
    noShowPenaltiesEnabled: formData.get("noShowPenaltiesEnabled") === "on",
    penaltiesApplyToClassOnly: formData.get("penaltiesApplyToClassOnly") === "on",
    socialsExcludedFromPenalties: formData.get("socialsExcludedFromPenalties") === "on",
    socialsBookable: formData.get("socialsBookable") === "on",
    weeklyEventsBookable: formData.get("weeklyEventsBookable") === "on",
    studentPracticeBookable: formData.get("studentPracticeBookable") === "on",
  };

  // --- Role balanced style names (multi-checkbox) ---
  const rawStyles = formData.getAll("roleBalancedStyleNames") as string[];
  const roleBalancedStyleNames = rawStyles.filter((s) => VALID_STYLE_NAMES.has(s));

  // --- Provisional notes ---
  const provisionalNotes = ((formData.get("provisionalNotes") as string) ?? "").trim();

  const patch: Partial<AppSettings> = {
    ...numericFields,
    ...booleanFields,
    roleBalancedStyleNames,
    provisionalNotes,
  };

  const updated = updateSettings(patch);
  revalidatePath("/settings");
  revalidatePath("/penalties");
  return { success: true, settings: updated };
}
