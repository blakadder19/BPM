/**
 * Profile provisioning — ensures a real Supabase auth user has
 * the corresponding public.users + student_profiles rows.
 *
 * Called ONLY from the auth callback after signup confirmation,
 * never from layout/render paths.
 *
 * CLAIMING SAFETY: If the user already exists in public.users
 * (e.g. admin-created student claiming their account via password
 * reset), we only sync the email and skip full provisioning to
 * avoid overwriting admin-set data (name, notes, phone, etc.).
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

    // Step 1: Check if user already exists (admin-created student claiming account)
    step = "check existing user";
    const { data: existingUserRaw } = await admin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .maybeSingle();

    if (existingUserRaw) {
      // User already exists — this is an account claim (password reset) or
      // repeat callback. Only sync the email in case it changed; do NOT
      // overwrite full_name, phone, notes, or any other admin-set data.
      step = "sync email for existing user";
      const { error: syncErr } = await admin
        .from("users")
        .update({ email: authUser.email ?? "" } as never)
        .eq("id", authUser.id);
      if (syncErr) {
        console.warn(`[ensureProfile] email sync: ${syncErr.message}`);
      }
      console.info(
        `[ensureProfile] Existing profile found — skipped full provisioning (claim-safe).`
      );
      return { success: true };
    }

    // Step 2: Find or create academy (new user only)
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

    // Step 3: Insert public.users row (new user)
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

    // Step 4: Insert student_profiles row if student (new user)
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

    console.info(`[ensureProfile] Provisioned new user (role=${role})`);
    return { success: true };
  } catch (err) {
    const msg = `Exception at "${step}": ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[ensureProfile] ${msg}`);
    return { success: false, error: msg };
  }
}
