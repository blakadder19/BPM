"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export interface AuthResult {
  error: string | null;
}

const AUTH_COOKIE_RE = /^sb-.+-auth-token/;

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  for (const c of cookieStore.getAll()) {
    if (AUTH_COOKIE_RE.test(c.name)) {
      cookieStore.delete(c.name);
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
}
