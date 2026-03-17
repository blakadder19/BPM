import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE_RE = /^sb-.+-auth-token/;

/**
 * Pure cookie-presence check for route protection.
 * Makes ZERO remote calls — avoids fetch failures when the server
 * process cannot reach Supabase (firewall, corporate network, etc.).
 * Real token validation is deferred to server components / actions
 * that call getUser() on-demand.
 */
export function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });
  const hasSession = request.cookies
    .getAll()
    .some((c) => AUTH_COOKIE_RE.test(c.name));

  return {
    supabaseResponse,
    user: hasSession ? ({} as Record<string, unknown>) : null,
  };
}
