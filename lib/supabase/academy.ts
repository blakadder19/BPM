/**
 * Centralized academy ID resolver.
 *
 * Queries public.academies once per server lifecycle and caches the result.
 * All repositories that need academy_id should use getAcademyId() instead of
 * hardcoding a UUID.
 */

import { createAdminClient } from "./admin";

let cachedAcademyId: string | null = null;

export async function getAcademyId(): Promise<string> {
  if (cachedAcademyId) return cachedAcademyId;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to resolve academy_id: ${error?.message ?? "no academy row found"}`
    );
  }

  cachedAcademyId = (data as { id: string }).id;
  return cachedAcademyId;
}
