import { cache } from "react";
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
 * Uses getSession() instead of getUser() because middleware has ALREADY
 * called getUser() to validate/refresh the JWT for this request.
 * getSession() is a local cookie read (no HTTP call), saving ~200ms.
 *
 * 1. Read the session from cookies (JWT already validated by middleware)
 * 2. Look up public.users via admin client — only the columns we need
 * 3. If no DB row, fall back to verified user metadata from the JWT
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

  // Safe to use getSession() here — middleware already validated the JWT
  // via getUser() earlier in this request. This avoids a duplicate HTTP
  // round-trip to the Supabase Auth server.  Suppress the Supabase
  // library warning that would otherwise fire on every request.
  let authUser;
  try {
    const _origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("supabase.auth.getSession()")) return;
      _origWarn.apply(console, args);
    };
    const { data: { session }, error } = await supabase.auth.getSession();
    console.warn = _origWarn;
    if (error || !session?.user) return null;
    authUser = session.user;
  } catch {
    return null;
  }

  const emailConfirmed = !!authUser.email_confirmed_at;

  // Build identity from JWT metadata — used as fast path or fallback.
  const email = authUser.email ?? "";
  const isDev = process.env.NODE_ENV === "development";
  const demo = isDev ? DEMO_ACCOUNTS[email] : undefined;
  const meta = authUser.user_metadata ?? {};
  const jwtUser: AuthUser = {
    id: authUser.id,
    email,
    fullName: demo?.fullName ?? meta.full_name ?? (email || "BPM User"),
    role: (meta.role as UserRole) ?? demo?.role ?? "student",
    avatarUrl: null,
    academyId: meta.academy_id ?? "",
    emailConfirmed,
  };

  // When the JWT was just issued (signInWithPassword), the metadata is
  // guaranteed fresh — skip the DB lookup entirely to save ~80-120ms.
  // The cookie is set client-side in the login form and cleared by
  // middleware on the response so subsequent requests still hit the DB.
  const cookieStore = await cookies();
  const freshJwt = !!cookieStore.get("bpm_fresh_jwt")?.value;
  if (freshJwt && jwtUser.role) {
    return jwtUser;
  }

  // Normal path: DB lookup via admin client (bypasses RLS).
  // Select only the columns we actually use to reduce payload size.
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("users")
      .select("id,email,full_name,role,avatar_url,academy_id")
      .eq("id", authUser.id)
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
    // DB unreachable — use JWT metadata
  }

  return jwtUser;
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
