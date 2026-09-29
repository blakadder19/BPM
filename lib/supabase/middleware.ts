import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
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
 *
 * Timeouts: a HUNG Auth call never returns an error, so the fallback above
 * never runs and Vercel kills the invocation with a 504. Every Auth call is
 * therefore bounded. A timeout is reported as `authUnavailable` — neither
 * "signed in" (the session was not validated) nor "signed out" (signing out
 * here would log every user out for the length of an Auth outage).
 */
export const AUTH_TIMEOUT_MS = 5000;

const TIMED_OUT = Symbol("auth_timed_out");

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Minimal self-contained page: rendering the app shell would need Supabase too. */
export function authUnavailableResponse(retryPath: string): NextResponse {
  // Same-origin paths only: "//host" would be a protocol-relative link off-site.
  const safePath = retryPath.startsWith("/") && !retryPath.startsWith("//") ? retryPath : "/";
  const href = escapeHtml(safePath);
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BPM is temporarily unavailable</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1f2937">
<h1 style="font-size:1.25rem">BPM is temporarily unavailable</h1>
<p>We couldn't confirm your sign-in because our login service isn't responding. You are still signed in &mdash; please try again in a minute.</p>
<p><a href="${href}" style="color:#4f46e5">Try again</a></p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "30",
      "Cache-Control": "no-store",
    },
  });
}

export interface UpdateSessionResult {
  supabaseResponse: NextResponse;
  user: User | null;
  /** Supabase Auth did not answer within AUTH_TIMEOUT_MS. */
  authUnavailable: boolean;
}

export async function updateSession(
  request: NextRequest,
  authTimeoutMs: number = AUTH_TIMEOUT_MS,
): Promise<UpdateSessionResult> {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { supabaseResponse, user: null, authUnavailable: false };
  }

  const unavailable = (): UpdateSessionResult => {
    console.warn(
      `[middleware] Supabase Auth did not respond within ${authTimeoutMs}ms path=${request.nextUrl.pathname}`,
    );
    return { supabaseResponse, user: null, authUnavailable: true };
  };

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

  let user: User | null = null;

  if (freshJwt) {
    // getSession() is local unless the access token has expired, in which
    // case it refreshes over the network — so it needs the bound too.
    const sessionResult = await withTimeout(supabase.auth.getSession(), authTimeoutMs);
    if (sessionResult === TIMED_OUT) return unavailable();
    user = sessionResult.data.session?.user ?? null;

    supabaseResponse.cookies.set("bpm_fresh_jwt", "", {
      path: "/",
      maxAge: 0,
    });
  } else {
    const userResult = await withTimeout(supabase.auth.getUser(), authTimeoutMs);
    if (userResult === TIMED_OUT) return unavailable();
    const { data, error } = userResult;
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
          const sessionResult = await withTimeout(supabase.auth.getSession(), authTimeoutMs);
          if (sessionResult === TIMED_OUT) return unavailable();
          const { data: { session } } = sessionResult;
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

  return { supabaseResponse, user, authUnavailable: false };
}
