"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
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
  await requireRole(["admin"]);
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
  };

  // --- Role balanced style names (multi-checkbox) ---
  const rawStyles = formData.getAll("roleBalancedStyleNames") as string[];
  const roleBalancedStyleNames = rawStyles.filter((s) => VALID_STYLE_NAMES.has(s));

  // --- Provisional notes ---
  const provisionalNotes = ((formData.get("provisionalNotes") as string) ?? "").trim();

  const patch: Partial<AppSettings> = {
    ...numericFields,
    ...attendanceNumeric,
    ...booleanFields,
    roleBalancedStyleNames,
    provisionalNotes,
  };

  const updated = updateSettings(patch);
  revalidatePath("/settings");
  revalidatePath("/penalties");
  return { success: true, settings: updated };
}
