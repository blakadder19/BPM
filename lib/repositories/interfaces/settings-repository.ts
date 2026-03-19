import type { AppSettings } from "@/lib/services/settings-store";

export interface ISettingsRepository {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<AppSettings>;
}
