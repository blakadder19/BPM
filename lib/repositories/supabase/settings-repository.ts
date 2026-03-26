/**
 * Supabase-mode SettingsRepository.
 *
 * Delegates to the file-backed settings store (.data/settings.json).
 * A future enhancement can read/write the business_rules table instead.
 */

import type { ISettingsRepository } from "../interfaces/settings-repository";
import {
  getSettings,
  updateSettings,
  type AppSettings,
} from "@/lib/services/settings-store";

export const supabaseSettingsRepo: ISettingsRepository = {
  async get(): Promise<AppSettings> {
    return getSettings();
  },
  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    return updateSettings(patch);
  },
};
