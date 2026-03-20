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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return { success: false, error: "No authenticated session" };
    }
    return await ensureSupabaseProfile(session.user);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[provisionCurrentUser]", msg);
    return { success: false, error: msg };
  }
}
