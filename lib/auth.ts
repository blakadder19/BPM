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
    // DB unreachable — fall through to session metadata fallback
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
