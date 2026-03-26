/**
 * Supabase-mode SettingsRepository.
 *
 * Delegates to the settings store which reads from a globalThis cache
 * (hydrated from business_rules on cold start) and writes through to
 * the business_rules table.
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
