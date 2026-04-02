import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Server-side route handler for Supabase email-link verification.
 *
 * Handles two email-link formats:
 *  1. Modern (token_hash): link goes directly here with ?token_hash=…&type=…
 *  2. Legacy PKCE: link goes through Supabase auth server which redirects here with ?code=…
 *
 * For password recovery, always redirects to /update-password so the student
 * can set their new password with an active recovery session.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");
  const code = searchParams.get("code");

  const pendingCookies: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  let verified = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) verified = true;
  }

  if (!verified && code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) verified = true;
  }

  let destination: URL;
  if (!verified) {
    destination = new URL("/login", request.url);
    destination.searchParams.set("error", "auth_callback_failed");
  } else if (type === "recovery") {
    destination = new URL("/update-password", request.url);
  } else {
    destination = new URL(safeRedirectPath(next) ?? "/dashboard", request.url);
  }

  const response = NextResponse.redirect(destination);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options as never);
  }
  return response;
}

function safeRedirectPath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.pathname + url.search;
  } catch {
    return raw.startsWith("/") ? raw : null;
  }
}
