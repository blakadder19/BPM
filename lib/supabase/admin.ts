import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let _cached: SupabaseClient<Database> | null = null;

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in trusted server contexts (actions, repos).
 *
 * Cached as a module-level singleton because the service-role client
 * is stateless (no session, no refresh tokens) and safe to reuse.
 */
export function createAdminClient(): SupabaseClient<Database> {
  if (_cached) return _cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  _cached = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _cached;
}
