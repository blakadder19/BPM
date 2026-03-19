import { getSettings, updateSettings } from "@/lib/services/settings-store";
import type { ISettingsRepository } from "../interfaces/settings-repository";

export const memorySettingsRepo: ISettingsRepository = {
  get: async () => getSettings(),
  update: async (patch) => updateSettings(patch),
};
