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

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // /signup?awaiting=1 on page-level refresh → redirect to /login
  if (pathname === "/signup" && searchParams.get("awaiting") === "1") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Memory mode: skip all Supabase auth checks
  if (isMemoryMode()) {
    return NextResponse.next({ request });
  }

  const { supabaseResponse, user } = await updateSession(request);

  // Public routes: always accessible
  if (isPublicRoute(pathname)) {
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
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
