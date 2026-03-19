import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMemoryMode } from "@/lib/config/data-provider";
import type { UserRole } from "@/types/domain";
import type { Database } from "@/types/database";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl: string | null;
  academyId: string;
  emailConfirmed: boolean;
}

const DEMO_ACCOUNTS: Record<string, { fullName: string; role: UserRole }> = {
  "admin@bpm.dance": { fullName: "Admin User", role: "admin" },
  "teacher@bpm.dance": { fullName: "Maria Garcia", role: "teacher" },
  "student@bpm.dance": { fullName: "Student User", role: "student" },
};

const DEV_USERS: Record<UserRole, AuthUser> = {
  admin: { id: "dev-admin", email: "admin@bpm.dance", fullName: "Admin User", role: "admin", avatarUrl: null, academyId: "", emailConfirmed: true },
  teacher: { id: "dev-teacher", email: "teacher@bpm.dance", fullName: "Maria Garcia", role: "teacher", avatarUrl: null, academyId: "", emailConfirmed: true },
  student: { id: "dev-student", email: "student@bpm.dance", fullName: "Student User", role: "student", avatarUrl: null, academyId: "", emailConfirmed: true },
};

function resolveDevStudent(studentId: string): AuthUser | null {
  const { STUDENTS } = require("@/lib/mock-data");
  const student = STUDENTS.find((s: { id: string }) => s.id === studentId);
  if (!student) return null;
  return {
    id: student.id,
    email: student.email,
    fullName: student.fullName,
    role: "student" as UserRole,
    avatarUrl: null,
    academyId: "",
    emailConfirmed: true,
  };
}

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * On-demand profile provisioning.
 * When a real Supabase auth user has no public.users row, create one
 * (plus student_profiles if applicable). Uses the admin client to
 * bypass RLS. Ensures at least one academy row exists.
 *
 * Silently swallows errors — tables may not exist if migrations
 * haven't been applied yet.
 */
async function ensureSupabaseProfile(authUser: SupabaseAuthUser): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const meta = authUser.user_metadata ?? {};

    // Ensure at least one academy exists
    const { data: existingAcademyRaw } = await admin
      .from("academies")
      .select("id")
      .limit(1)
      .maybeSingle();

    const existingAcademy = existingAcademyRaw as { id: string } | null;
    let academyId: string | undefined = existingAcademy?.id;

    if (!academyId) {
      const { data: newAcademyRaw, error: acadErr } = await admin
        .from("academies")
        .insert({ name: "BPM Dublin", slug: "bpm-dublin" } as never)
        .select("id")
        .single();
      if (acadErr || !newAcademyRaw) return;
      academyId = (newAcademyRaw as { id: string }).id;
    }

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
      console.warn("[auth] Failed to upsert users row:", userErr.message);
      return;
    }

    if (role === "student") {
      const preferredRole = (meta.preferred_role as string) ?? null;
      const dateOfBirth = (meta.date_of_birth as string) ?? null;
      await admin.from("student_profiles").upsert(
        {
          id: authUser.id,
          preferred_role: preferredRole,
          date_of_birth: dateOfBirth,
        } as never,
        { onConflict: "id" }
      );
    }
  } catch {
    // Tables may not exist — silently skip provisioning
  }
}

/**
 * Try to resolve user from a real Supabase session.
 * Returns null if no session, Supabase is unreachable, or not configured.
 */
async function resolveSupabaseUser(): Promise<AuthUser | null> {
  if (!hasSupabaseConfig()) return null;

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return null;
  }

  let session;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    return null;
  }

  if (!session?.user) return null;

  const emailConfirmed = !!session.user.email_confirmed_at;

  // Try to load the full profile from the DB
  try {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .single();
    const dbUser = data as UserRow | null;
    if (dbUser) {
      return {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.full_name,
        role: dbUser.role as UserRole,
        avatarUrl: dbUser.avatar_url,
        academyId: dbUser.academy_id,
        emailConfirmed,
      };
    }
  } catch {
    // DB unreachable — fall through to provisioning attempt
  }

  // No DB row found — try to create one on demand
  await ensureSupabaseProfile(session.user);

  // Retry the profile load after provisioning
  try {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("id", session.user.id)
      .single();
    const dbUser = data as UserRow | null;
    if (dbUser) {
      return {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.full_name,
        role: dbUser.role as UserRole,
        avatarUrl: dbUser.avatar_url,
        academyId: dbUser.academy_id,
        emailConfirmed,
      };
    }
  } catch {
    // Still unreachable — fall through to metadata fallback
  }

  // Fallback: derive identity from session JWT claims / user_metadata
  const email = session.user.email ?? "";
  const demo = DEMO_ACCOUNTS[email];
  const meta = session.user.user_metadata ?? {};
  return {
    id: session.user.id,
    email,
    fullName: demo?.fullName ?? meta.full_name ?? (email || "BPM User"),
    role: (meta.role as UserRole) ?? demo?.role ?? "student",
    avatarUrl: null,
    academyId: meta.academy_id ?? "",
    emailConfirmed,
  };
}

/**
 * Resolve user from dev cookies (memory mode fallback).
 * Only used in development when no real Supabase session is active.
 */
async function resolveDevUser(): Promise<AuthUser> {
  const cookieStore = await cookies();
  const role = cookieStore.get("dev_role")?.value as UserRole | undefined;
  if (role === "student") {
    const studentId = cookieStore.get("dev_student_id")?.value;
    if (studentId) {
      const impersonated = resolveDevStudent(studentId);
      if (impersonated) return impersonated;
    }
  }
  return DEV_USERS[role ?? "admin"] ?? DEV_USERS.admin;
}

/**
 * Get the current authenticated user.
 *
 * Priority:
 * 1. If a real Supabase session exists (even in memory mode), use it.
 *    This ensures real signed-up users are never overridden by dev identity.
 * 2. In memory mode with no real session, fall back to dev cookie identity.
 * 3. In supabase mode with no session, return null (unauthenticated).
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  // Always try real Supabase session first (if configured)
  const realUser = await resolveSupabaseUser();
  if (realUser) return realUser;

  // No real session — in memory/dev mode, use dev cookie identity
  if (isMemoryMode()) {
    return resolveDevUser();
  }

  return null;
}

/**
 * Require authentication. Redirects to /login if not authenticated.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Require one of the given roles. Redirects to /dashboard with no
 * access if the user's role doesn't match.
 */
export async function requireRole(
  allowedRoles: UserRole[]
): Promise<AuthUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
