/**
 * Central configuration for which data backend the app uses.
 *
 * DATA_PROVIDER env var controls whether the app reads/writes
 * from in-memory mock stores ("memory") or a live Supabase
 * database ("supabase"). Defaults to "memory" in development;
 * in production, DATA_PROVIDER must be explicitly set to "supabase".
 */

export type DataProvider = "memory" | "supabase";

export function getDataProvider(): DataProvider {
  const raw = process.env.DATA_PROVIDER?.trim().toLowerCase();
  if (raw === "supabase") return "supabase";
  if (process.env.NODE_ENV === "production" && raw !== "memory") {
    console.error(
      "[FATAL] DATA_PROVIDER is not set to 'supabase' in production. " +
      "Set DATA_PROVIDER=supabase in your environment variables. " +
      "Refusing to fall back to memory mode.",
    );
    throw new Error("DATA_PROVIDER must be 'supabase' in production");
  }
  return "memory";
}

export function isSupabaseMode(): boolean {
  return getDataProvider() === "supabase";
}

export function isMemoryMode(): boolean {
  return getDataProvider() === "memory";
}
