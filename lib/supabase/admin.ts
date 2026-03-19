import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in trusted server contexts (actions, repos).
 *
 * Auth session management is disabled because this runs on the server
 * where there is no browser storage or refresh token flow.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
