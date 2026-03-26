"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isMemoryMode } from "@/lib/config/data-provider";

export interface AuthResult {
  error: string | null;
}

const AUTH_COOKIE_RE = /^sb-.+-auth-token/;

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();

  // If Supabase is configured, sign out through the server client
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    try {
      const { createServerSupabaseClient } = await import(
        "@/lib/supabase/server"
      );
      const supabase = await createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Supabase unreachable — fall through to manual cookie cleanup
    }
  }

  // Clear any remaining auth cookies manually
  for (const c of cookieStore.getAll()) {
    if (AUTH_COOKIE_RE.test(c.name)) {
      cookieStore.delete(c.name);
    }
  }

  // Clear dev cookies if in memory/dev mode
  if (isMemoryMode()) {
    try {
      cookieStore.delete("dev_role");
      cookieStore.delete("dev_student_id");
    } catch {
      // Ignore
    }
  }

  redirect("/login");
}

const VALID_DEV_ROLES = new Set(["admin", "teacher", "student"]);

export async function switchDevRole(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const role = formData.get("role") as string;
  if (!VALID_DEV_ROLES.has(role)) return;
  const cookieStore = await cookies();
  cookieStore.set("dev_role", role, { path: "/", httpOnly: true, sameSite: "lax" });
  if (role !== "student") {
    cookieStore.delete("dev_student_id");
  }
}

export async function switchDevStudent(studentId: string): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const cookieStore = await cookies();
  cookieStore.set("dev_role", "student", { path: "/", httpOnly: true, sameSite: "lax" });
  cookieStore.set("dev_student_id", studentId, { path: "/", httpOnly: true, sameSite: "lax" });
}

export async function getDevStudentId(): Promise<string | null> {
  if (process.env.NODE_ENV !== "development") return null;
  const cookieStore = await cookies();
  return cookieStore.get("dev_student_id")?.value ?? null;
}
