import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMemoryMode } from "@/lib/config/data-provider";
import { verifySessionClaims } from "@/lib/auth-token";
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
 * 1. Verify the session's access token (lib/auth-token.ts). Fails closed:
 *    if it cannot be verified, there is no user.
 * 2. Look up public.users via admin client — only the columns we need
 * 3. If no DB row, fall back to a student identity built from the token
 *
 * Identity comes only from verified claims (sub, email). The role and
 * academy only ever come from public.users: user_metadata is writable by
 * the user themselves, so it is never trusted for authorisation or tenancy.
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

  // Middleware is not a verification guarantee: public routes skip it.
  const claims = await verifySessionClaims(supabase.auth, process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (!claims) return null;

  // email_confirmed_at is not in the JWT. It is read from the cookie session
  // only after verification and only when it belongs to the verified subject;
  // it gates the confirm-email screen, never identity or permissions.
  let emailConfirmed = false;
  const _origWarn = console.warn;
  try {
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("supabase.auth.getSession()")) return;
      _origWarn.apply(console, args);
    };
    const { data: { session } } = await supabase.auth.getSession();
    emailConfirmed = session?.user?.id === claims.sub && !!session.user.email_confirmed_at;
  } catch {
    emailConfirmed = false;
  } finally {
    console.warn = _origWarn;
  }

  const email = claims.email ?? "";
  const isDev = process.env.NODE_ENV === "development";
  const demo = isDev ? DEMO_ACCOUNTS[email] : undefined;
  const meta = claims.user_metadata ?? {};
  const tokenUser: AuthUser = {
    id: claims.sub,
    email,
    fullName: demo?.fullName ?? meta.full_name ?? (email || "BPM User"),
    role: demo?.role ?? "student",
    avatarUrl: null,
    academyId: "",
    emailConfirmed,
  };

  // DB lookup via admin client (bypasses RLS).
  // Select only the columns we actually use to reduce payload size.
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("users")
      .select("id,email,full_name,role,avatar_url,academy_id")
      .eq("id", claims.sub)
      .maybeSingle();
    const dbUser = data as Pick<UserRow, "id" | "email" | "full_name" | "role" | "avatar_url" | "academy_id"> | null;
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
    // DB unreachable — fall back to the least-privileged identity
  }

  return tokenUser;
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
 * Wrapped with React.cache() so that multiple calls within the same
 * server-component render tree (same HTTP request) are deduplicated.
 *
 * Priority:
 * 1. Real Supabase session (even in memory mode) — never overridden by dev identity.
 * 2. In memory mode with no real session — dev cookie identity.
 * 3. In supabase mode with no session — null (unauthenticated).
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const realUser = await resolveSupabaseUser();
  if (realUser) return realUser;

  if (isMemoryMode()) {
    return resolveDevUser();
  }

  return null;
});

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
