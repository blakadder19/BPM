"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureSupabaseProfile } from "@/lib/auth-provisioning";

/**
 * Server action called from the auth callback after session is established.
 * Ensures the authenticated user has public.users + student_profiles rows.
 * Safe to call multiple times (upsert-based).
 *
 * Returns `inviteApplied: true` when staff-invite acceptance changed the
 * user's role/permissions during this call, so the caller (login form)
 * can skip the JWT fast-path cookie and force a fresh DB-backed render
 * on the very first page load after login.
 */
export async function provisionCurrentUser(): Promise<{
  success: boolean;
  error?: string;
  inviteApplied?: boolean;
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
