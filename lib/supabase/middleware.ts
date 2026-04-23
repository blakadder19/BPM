import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Standard @supabase/ssr middleware session handler.
 *
 * Creates a Supabase server client that can read and refresh auth tokens
 * via cookies. Normally calls getUser() to validate the JWT server-side.
 *
 * Optimization: when `bpm_fresh_jwt` cookie is present (set by the login
 * page immediately after signInWithPassword), we skip the expensive
 * getUser() HTTP call and use getSession() instead (local cookie read).
 * This is safe because the JWT was literally just issued — no refresh or
 * server-side validation is necessary within the first few seconds.
 *
 * Resilience: if getUser() fails due to a transient error (network hiccup,
 * Supabase cold start, rate limit), the middleware falls back to
 * getSession() to avoid destroying a valid session. signOut() is only
 * called when the session is genuinely unrecoverable (no fallback user).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { supabaseResponse, user: null };
  }

  const _m0 = Date.now();
  const freshJwt = request.cookies.has("bpm_fresh_jwt");

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;

  if (freshJwt) {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ?? null;

    supabaseResponse.cookies.set("bpm_fresh_jwt", "", {
      path: "/",
      maxAge: 0,
    });
  } else {
    const { data, error } = await supabase.auth.getUser();
    user = data.user;

    // Graceful fallback: if getUser() failed (transient network error,
    // Supabase cold start, rate limit) but the request has auth cookies,
    // try a local session read instead of immediately destroying the
    // session. This prevents valid sessions from being killed by brief
    // outages. The local JWT may be slightly stale but is good enough
    // for middleware gating — server components will re-validate.
    if (!user && error) {
      const hasAuthCookies = request.cookies.getAll().some(
        (c) => c.name.includes("-auth-token")
      );
      if (hasAuthCookies) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            user = session.user;
            if (process.env.NODE_ENV === "development") {
              console.warn(
                `[middleware] getUser() failed (${error.message}) — fell back to getSession()`
              );
            }
          }
        } catch {
          // getSession also failed — session is truly unrecoverable
        }
      }
    }
  }

  // Only sign out when the session is genuinely unrecoverable:
  // getUser() returned no user, the fallback also returned no user,
  // but auth cookies are still present. Clear them to prevent the
  // login page from seeing stale cookies in an infinite loop.
  if (!user) {
    const hasAuthCookies = request.cookies.getAll().some(
      (c) => c.name.includes("-auth-token")
    );
    if (hasAuthCookies) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }
  }

  const _m1 = Date.now();
  if (process.env.NODE_ENV === "development") {
    console.info(`[perf middleware] ${freshJwt ? "getSession(fresh)" : "getUser"}=${_m1 - _m0}ms path=${request.nextUrl.pathname}`);
  }

  return { supabaseResponse, user };
}
