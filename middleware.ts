import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback", "/auth/confirm", "/reset-password", "/update-password", "/checkout", "/embed-entry", "/explore"];
const API_ROUTES_SELF_AUTH = ["/api/lifecycle", "/api/webhooks"];

const EMBED_ALLOWED_ORIGINS = [
  "https://www.balancepowermotion.com",
  "https://balancepowermotion.com",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function isSelfAuthApiRoute(pathname: string): boolean {
  return API_ROUTES_SELF_AUTH.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function isMemoryMode(): boolean {
  return process.env.DATA_PROVIDER?.trim().toLowerCase() !== "supabase";
}

function applyFrameHeaders(response: NextResponse, pathname: string): void {
  if (pathname === "/embed-entry") {
    const csp = EMBED_ALLOWED_ORIGINS.map((o) => `${o}`).join(" ");
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${csp}`,
    );
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // /signup?awaiting=1 on page-level refresh → redirect to /login
  if (pathname === "/signup" && searchParams.get("awaiting") === "1") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Memory mode: skip all Supabase auth checks
  if (isMemoryMode()) {
    const response = NextResponse.next({ request });
    applyFrameHeaders(response, pathname);
    return response;
  }

  // Public routes: skip the expensive getUser() call entirely —
  // no auth validation needed for login/signup/callback pages.
  if (isPublicRoute(pathname)) {
    const response = NextResponse.next({ request });
    applyFrameHeaders(response, pathname);
    return response;
  }

  const { supabaseResponse, user } = await updateSession(request);

  // API routes with their own auth (e.g. CRON_SECRET): skip session check
  if (isSelfAuthApiRoute(pathname)) {
    applyFrameHeaders(supabaseResponse, pathname);
    return supabaseResponse;
  }

  // No session on a protected route → redirect to /login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Prevent BFCache from showing stale protected pages after logout
  supabaseResponse.headers.set("Cache-Control", "no-store, must-revalidate");
  applyFrameHeaders(supabaseResponse, pathname);
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
