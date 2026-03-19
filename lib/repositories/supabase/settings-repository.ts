import type { ISettingsRepository } from "../interfaces/settings-repository";

export const supabaseSettingsRepo: ISettingsRepository = {
  async get() {
    throw new Error(
      "Supabase SettingsRepository not yet implemented. " +
      "Set DATA_PROVIDER=memory to use the file-backed settings store."
    );
  },
  async update() {
    throw new Error(
      "Supabase SettingsRepository not yet implemented. " +
      "Set DATA_PROVIDER=memory to use the file-backed settings store."
    );
  },
};
