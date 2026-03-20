import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback"];

/**
 * Generated once per process start. When the dev server restarts this value
 * changes, causing existing browser sessions to be invalidated.
 */
const SERVER_BOOT_ID = crypto.randomUUID();

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function isMemoryMode(): boolean {
  return process.env.DATA_PROVIDER?.trim().toLowerCase() !== "supabase";
}

const BOOT_COOKIE = "bpm-sid";

export function middleware(request: NextRequest) {
  const { supabaseResponse, user } = updateSession(request);
  const { pathname, searchParams } = request.nextUrl;

  // /signup?awaiting=1 on page-level refresh → redirect to /login
  if (pathname === "/signup" && searchParams.get("awaiting") === "1") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Stamp boot-ID on every public-route response so it's ready after login
  if (isPublicRoute(pathname)) {
    supabaseResponse.cookies.set(BOOT_COOKIE, SERVER_BOOT_ID, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    return supabaseResponse;
  }

  if (isMemoryMode()) {
    return NextResponse.next({ request });
  }

  // Protected route: enforce fresh session per server boot
  if (user) {
    const bootCookie = request.cookies.get(BOOT_COOKIE)?.value;
    if (bootCookie !== SERVER_BOOT_ID) {
      // Session predates this server boot — clear auth cookies and redirect
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.delete("next");
      const response = NextResponse.redirect(loginUrl);

      // Delete Supabase auth cookies
      for (const cookie of request.cookies.getAll()) {
        if (/^sb-.+-auth-token/.test(cookie.name)) {
          response.cookies.delete(cookie.name);
        }
      }
      response.cookies.delete(BOOT_COOKIE);
      return response;
    }
  }

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
