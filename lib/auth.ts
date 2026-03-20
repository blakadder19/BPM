import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMemoryMode } from "@/lib/config/data-provider";
import type { UserRole } from "@/types/domain";
import type { Database } from "@/types/database";

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
 * Lightweight Supabase user resolution — NO provisioning.
 *
 * 1. Verify the authenticated user via getUser() (server-authoritative)
 * 2. Look up public.users via admin client (bypasses RLS)
 * 3. If no DB row, fall back to verified user metadata
 *
 * Profile provisioning happens ONLY in the auth callback, not here.
 */
async function resolveSupabaseUser(): Promise<AuthUser | null> {
  if (!hasSupabaseConfig()) return null;

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch {
    return null;
  }

  let authUser;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    authUser = data.user;
  } catch {
    return null;
  }

  const emailConfirmed = !!authUser.email_confirmed_at;

  // Try DB lookup via admin client (bypasses RLS, no session needed)
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
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
    // DB unreachable — fall through to metadata
  }

  // No DB row — derive identity from verified user metadata
  const email = authUser.email ?? "";
  const demo = DEMO_ACCOUNTS[email];
  const meta = authUser.user_metadata ?? {};
  return {
    id: authUser.id,
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
 * 1. Real Supabase session (even in memory mode) — never overridden by dev identity.
 * 2. In memory mode with no real session — dev cookie identity.
 * 3. In supabase mode with no session — null (unauthenticated).
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const realUser = await resolveSupabaseUser();
  if (realUser) return realUser;

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
 * Require one of the given roles.
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
