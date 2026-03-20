"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureSupabaseProfile } from "@/lib/auth-provisioning";

/**
 * Server action called from the auth callback after session is established.
 * Ensures the authenticated user has public.users + student_profiles rows.
 * Safe to call multiple times (upsert-based).
 */
export async function provisionCurrentUser(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return { success: false, error: "No authenticated user" };
    }
    return await ensureSupabaseProfile(user);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[provisionCurrentUser]", msg);
    return { success: false, error: msg };
  }
}
