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
