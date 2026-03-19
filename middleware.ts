import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function isMemoryMode(): boolean {
  return process.env.DATA_PROVIDER?.trim().toLowerCase() !== "supabase";
}

export function middleware(request: NextRequest) {
  const { supabaseResponse, user } = updateSession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    if (isMemoryMode()) {
      return NextResponse.next({ request });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Only redirect /login away when authenticated.
  // Do NOT redirect /signup — the user may be on the "check your email"
  // confirmation screen, which must remain stable across refreshes.
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
