/**
 * Central configuration for which data backend the app uses.
 *
 * DATA_PROVIDER env var controls whether the app reads/writes
 * from in-memory mock stores ("memory") or a live Supabase
 * database ("supabase"). Defaults to "memory" when unset.
 */

export type DataProvider = "memory" | "supabase";

export function getDataProvider(): DataProvider {
  const raw = process.env.DATA_PROVIDER?.trim().toLowerCase();
  if (raw === "supabase") return "supabase";
  return "memory";
}

export function isSupabaseMode(): boolean {
  return getDataProvider() === "supabase";
}

export function isMemoryMode(): boolean {
  return getDataProvider() === "memory";
}
