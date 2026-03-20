/**
 * Profile provisioning — ensures a real Supabase auth user has
 * the corresponding public.users + student_profiles rows.
 *
 * Called ONLY from the auth callback after signup confirmation,
 * never from layout/render paths.
 */

import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

export async function ensureSupabaseProfile(authUser: SupabaseAuthUser): Promise<{
  success: boolean;
  error?: string;
}> {
  let step = "init";
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const meta = authUser.user_metadata ?? {};

    // Step 1: Find or create academy
    step = "query academies";
    const { data: existingAcademyRaw, error: acadQueryErr } = await admin
      .from("academies")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (acadQueryErr) {
      const msg = `Failed at "${step}": ${acadQueryErr.message} (code: ${acadQueryErr.code})`;
      console.error(`[ensureProfile] ${msg}`);
      return { success: false, error: msg };
    }

    const existingAcademy = existingAcademyRaw as { id: string } | null;
    let academyId: string | undefined = existingAcademy?.id;

    if (!academyId) {
      step = "create academy";
      const { data: newAcademyRaw, error: acadErr } = await admin
        .from("academies")
        .insert({ name: "BPM Dublin", slug: "bpm-dublin" } as never)
        .select("id")
        .single();
      if (acadErr || !newAcademyRaw) {
        const msg = `Failed at "${step}": ${acadErr?.message ?? "no data returned"}`;
        console.error(`[ensureProfile] ${msg}`);
        return { success: false, error: msg };
      }
      academyId = (newAcademyRaw as { id: string }).id;
    }

    // Step 2: Upsert public.users row
    step = "upsert users";
    const role = (meta.role as string) ?? "student";
    const fullName = (meta.full_name as string) ?? authUser.email ?? "New User";
    const phone = (meta.phone as string) ?? null;

    const { error: userErr } = await admin.from("users").upsert(
      {
        id: authUser.id,
        academy_id: academyId,
        email: authUser.email ?? "",
        full_name: fullName,
        role,
        phone,
      } as never,
      { onConflict: "id" }
    );

    if (userErr) {
      const msg = `Failed at "${step}": ${userErr.message} (code: ${userErr.code})`;
      console.error(`[ensureProfile] ${msg}`);
      return { success: false, error: msg };
    }

    // Step 3: Upsert student_profiles row if student
    if (role === "student") {
      step = "upsert student_profiles";
      const preferredRole = (meta.preferred_role as string) ?? null;
      const dateOfBirth = (meta.date_of_birth as string) ?? null;
      const { error: profErr } = await admin.from("student_profiles").upsert(
        {
          id: authUser.id,
          preferred_role: preferredRole,
          date_of_birth: dateOfBirth,
        } as never,
        { onConflict: "id" }
      );
      if (profErr) {
        const msg = `Failed at "${step}": ${profErr.message} (code: ${profErr.code})`;
        console.error(`[ensureProfile] ${msg}`);
        return { success: false, error: msg };
      }
    }

    console.log(`[ensureProfile] Provisioned ${authUser.email} (role=${role})`);
    return { success: true };
  } catch (err) {
    const msg = `Exception at "${step}": ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[ensureProfile] ${msg}`);
    return { success: false, error: msg };
  }
}
