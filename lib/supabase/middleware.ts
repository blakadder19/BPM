import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

/**
 * Standard @supabase/ssr middleware session handler.
 *
 * Creates a Supabase server client that can read and refresh auth tokens
 * via cookies, and calls getUser() to validate the JWT server-side. The
 * unverified cookie session is never used as a user, under any failure.
 *
 * Fail closed:
 *   - getUser() returns a user            → signed in.
 *   - Auth rejects the token (4xx)        → signed out; cookies cleared.
 *   - Auth hangs (timeout), is unreachable, rate-limits or returns 5xx
 *                                         → `authUnavailable`: no user, and
 *     the caller serves an auth error instead of the page. Cookies are kept
 *     so the session works again once Auth recovers.
 *
 * Every Auth call is bounded: a HUNG call never returns an error, and
 * Vercel would otherwise kill the invocation with a 504.
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
  const safePath = safeRedirectPath(retryPath) ?? "/";
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
  /** Supabase Auth could not verify the session (timeout, network, 429, 5xx). */
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

  const unavailable = (reason: string): UpdateSessionResult => {
    console.warn(
      `[middleware] Supabase Auth could not verify the session (${reason}) path=${request.nextUrl.pathname}`,
    );
    return { supabaseResponse, user: null, authUnavailable: true };
  };

  const _m0 = Date.now();

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

  let userResult;
  try {
    userResult = await withTimeout(supabase.auth.getUser(), authTimeoutMs);
  } catch (err) {
    return unavailable(`getUser() threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (userResult === TIMED_OUT) return unavailable(`no response within ${authTimeoutMs}ms`);
  const { data, error } = userResult;
  const user: User | null = data.user;

  const transientAuthError =
    !!error &&
    (isAuthRetryableFetchError(error) || error.status === 429 || (error.status ?? 0) >= 500);
  if (!user && transientAuthError) {
    return unavailable(`transient error status=${error.status ?? "?"} ${error.message}`);
  }

  // Auth answered and did not accept the session: clear the cookies so the
  // login page does not see stale cookies in an infinite loop.
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
    console.info(`[perf middleware] getUser=${_m1 - _m0}ms path=${request.nextUrl.pathname}`);
  }

  return { supabaseResponse, user, authUnavailable: false };
}
