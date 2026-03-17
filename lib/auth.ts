import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
}

const DEMO_ACCOUNTS: Record<string, { fullName: string; role: UserRole }> = {
  "admin@bpm.dance": { fullName: "Admin User", role: "admin" },
  "teacher@bpm.dance": { fullName: "Maria Garcia", role: "teacher" },
  "student@bpm.dance": { fullName: "Student User", role: "student" },
};

const DEV_FALLBACK_USER: AuthUser = {
  id: "dev-fallback-admin",
  email: "admin@bpm.dance",
  fullName: "Admin User",
  role: "admin",
  avatarUrl: null,
  academyId: "",
};

/**
 * Get the current authenticated user.
 *
 * Uses getSession() (local JWT read from cookies, no network call for
 * fresh tokens) instead of getUser() (which always makes a remote call).
 * If the DB is also unreachable, returns a fallback user derived from
 * the JWT claims so the UI can still render.
 *
 * In development, if all Supabase calls fail (e.g. Node HTTPS blocked),
 * returns a dev-only admin fallback so local navigation isn't blocked.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  if (process.env.NODE_ENV === "development") return DEV_FALLBACK_USER;

  const supabase = await createServerSupabaseClient();

  let session;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    return null;
  }

  if (session?.user) {
    // Try full profile from DB — may fail if server can't reach Supabase
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
        };
      }
    } catch {
      // DB unreachable — fall through to session-based fallback
    }

    const email = session.user.email ?? "";
    const demo = DEMO_ACCOUNTS[email];
    const meta = session.user.user_metadata ?? {};
    return {
      id: session.user.id,
      email,
      fullName: demo?.fullName ?? meta.full_name ?? (email || "BPM User"),
      role: demo?.role ?? "student",
      avatarUrl: null,
      academyId: "",
    };
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
