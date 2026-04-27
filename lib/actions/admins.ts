"use server";

/**
 * Server actions for the minimal "Settings > Admins" management flow.
 *
 * Auth/role architecture (audit):
 *   - Source of truth for user role: `public.users.role` ("admin" | "teacher" | "student").
 *     `public.users.id` matches `auth.users.id`. `lib/auth.ts` resolves the role
 *     from this table on every request (with a JWT-metadata fallback).
 *   - Auth identity lives in Supabase Auth (`auth.users`). A trigger creates the
 *     `public.users` row when an auth user is created.
 *   - Service-role admin client (`lib/supabase/admin`) bypasses RLS — used here
 *     because RLS for `public.users` is not in scope of this minimal feature.
 *
 * Add/invite flow (chosen):
 *   1. If the email already exists in `public.users`:
 *        - already admin → no-op (success, alreadyAdmin = true)
 *        - non-admin     → promote: set role = "admin" (also updates auth
 *                          user_metadata.role for parity with JWT fast-path).
 *   2. If the email does not exist anywhere:
 *        - send a Supabase invite via `auth.admin.inviteUserByEmail` with
 *          user_metadata.role = "admin". Once the recipient clicks the link
 *          and sets a password, the existing auth callback provisions the
 *          `public.users` row with role = admin (see lib/auth-provisioning.ts).
 *
 * Promote flow:
 *   - Same as case (1.b) above, but explicitly invoked from the UI by id.
 *
 * Security:
 *   - Every action calls `requireRole(["admin"])`.
 *   - Self-demotion is not exposed in the UI; demote is intentionally not
 *     implemented here to keep the scope minimal.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type AdminUserSummary,
  type InviteAdminResult,
  type ListAdminsResult,
  isProbablyValidEmail,
  normalizeEmail,
} from "@/lib/domain/admins";

function hasSupabaseAdminConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function getInviteRedirectUrl(): string | undefined {
  // Prefer an explicit override; otherwise fall back to the public site URL
  // and let the existing /auth/callback route handle the new session.
  const override = process.env.BPM_ADMIN_INVITE_REDIRECT_URL;
  if (override) return override;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return `${site.replace(/\/$/, "")}/auth/callback?next=/dashboard`;
  return undefined;
}

export async function listAdminsAction(): Promise<ListAdminsResult> {
  const me = await requireRole(["admin"]);

  if (!hasSupabaseAdminConfig()) {
    // Memory mode — no real users table to enumerate.
    return {
      success: true,
      supabaseEnabled: false,
      admins: [
        {
          id: me.id,
          email: me.email,
          fullName: me.fullName,
          isCurrentUser: true,
          createdAt: null,
        },
      ],
    };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, created_at")
      .eq("role", "admin" as never)
      .order("created_at", { ascending: true });

    if (error) {
      return { success: false, supabaseEnabled: true, error: error.message };
    }

    const rows = (data ?? []) as Array<{
      id: string;
      email: string;
      full_name: string;
      created_at: string | null;
    }>;

    const admins: AdminUserSummary[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      isCurrentUser: r.id === me.id,
      createdAt: r.created_at,
    }));

    return { success: true, supabaseEnabled: true, admins };
  } catch (e) {
    return {
      success: false,
      supabaseEnabled: true,
      error: e instanceof Error ? e.message : "Failed to list admins",
    };
  }
}

export async function inviteAdminAction(input: {
  email: string;
}): Promise<InviteAdminResult> {
  const me = await requireRole(["admin"]);

  const email = normalizeEmail(input.email ?? "");
  if (!isProbablyValidEmail(email)) {
    return { success: false, error: "Enter a valid email address." };
  }

  if (!hasSupabaseAdminConfig()) {
    return {
      success: false,
      error:
        "Supabase is not configured in this environment. Admin invites require SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  try {
    const supabase = createAdminClient();

    // 1. Already a public.users row?
    const { data: existingRaw, error: lookupErr } = await supabase
      .from("users")
      .select("id, role, full_name, email")
      .ilike("email", email)
      .maybeSingle();

    if (lookupErr && lookupErr.code !== "PGRST116") {
      // PGRST116 = no rows — anything else is a real failure.
      return { success: false, error: lookupErr.message };
    }

    const existing = existingRaw as
      | { id: string; role: string; full_name: string; email: string }
      | null;

    if (existing) {
      if (existing.role === "admin") {
        return { success: true, alreadyAdmin: true, email };
      }
      // Promote in place.
      const { error: upErr } = await supabase
        .from("users")
        .update({ role: "admin" } as never)
        .eq("id", existing.id);
      if (upErr) return { success: false, error: upErr.message };

      // Best-effort: keep auth user_metadata.role in sync so JWT fast-path
      // does not surprise the freshly promoted admin.
      try {
        await supabase.auth.admin.updateUserById(existing.id, {
          user_metadata: { role: "admin" },
        });
      } catch {
        /* metadata sync is non-fatal */
      }

      console.info(
        `[admins] ${me.email} promoted ${existing.email} (${existing.id}) to admin`
      );
      revalidatePath("/settings");
      return { success: true, promoted: true, email };
    }

    // 2. No public.users row yet — send Supabase invite.
    const redirectTo = getInviteRedirectUrl();
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: { role: "admin" },
        ...(redirectTo ? { redirectTo } : {}),
      }
    );

    if (inviteErr) {
      // If Supabase says the user is already registered in auth but missing
      // from public.users, fall back to creating the public.users row at
      // first sign-in via the existing auth-callback provisioning. Surface
      // the underlying message so admins can act on it.
      return { success: false, error: inviteErr.message };
    }

    console.info(`[admins] ${me.email} invited ${email} as admin`);
    revalidatePath("/settings");
    return { success: true, invited: true, email };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to invite admin",
    };
  }
}

export async function promoteUserToAdminAction(input: {
  userId: string;
}): Promise<InviteAdminResult> {
  const me = await requireRole(["admin"]);

  if (!hasSupabaseAdminConfig()) {
    return {
      success: false,
      error: "Supabase is not configured in this environment.",
    };
  }

  if (!input.userId) {
    return { success: false, error: "Missing user id." };
  }

  try {
    const supabase = createAdminClient();
    const { data: existingRaw, error } = await supabase
      .from("users")
      .select("id, role, full_name, email")
      .eq("id", input.userId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    const existing = existingRaw as
      | { id: string; role: string; full_name: string; email: string }
      | null;
    if (!existing) return { success: false, error: "User not found." };
    if (existing.role === "admin") {
      return { success: true, alreadyAdmin: true, email: existing.email };
    }

    const { error: upErr } = await supabase
      .from("users")
      .update({ role: "admin" } as never)
      .eq("id", input.userId);
    if (upErr) return { success: false, error: upErr.message };

    try {
      await supabase.auth.admin.updateUserById(input.userId, {
        user_metadata: { role: "admin" },
      });
    } catch {
      /* metadata sync is non-fatal */
    }

    console.info(
      `[admins] ${me.email} promoted ${existing.email} (${existing.id}) to admin`
    );
    revalidatePath("/settings");
    return { success: true, promoted: true, email: existing.email };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to promote user",
    };
  }
}
