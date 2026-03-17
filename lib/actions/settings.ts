"use server";

import {
  getSettings,
  updateSettings,
  type AppSettings,
} from "@/lib/services/settings-store";

export async function saveSettings(
  formData: FormData
): Promise<{ success: boolean; settings: AppSettings; error?: string }> {
  const raw = {
    lateCancelFeeCents: Number(formData.get("lateCancelFeeCents")),
    noShowFeeCents: Number(formData.get("noShowFeeCents")),
    lateCancelCutoffMinutes: Number(formData.get("lateCancelCutoffMinutes")),
    allowedRoleImbalance: Number(formData.get("allowedRoleImbalance")),
  };

  for (const [key, val] of Object.entries(raw)) {
    if (isNaN(val) || val < 0) {
      return {
        success: false,
        settings: getSettings(),
        error: `Invalid value for ${key}`,
      };
    }
  }

  const updated = updateSettings(raw);
  return { success: true, settings: updated };
}
