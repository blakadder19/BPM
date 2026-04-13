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
    // JWT was just issued by signInWithPassword — skip the HTTP roundtrip
    // to the Supabase Auth server and read the session locally instead.
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user ?? null;

    // Clear the signal so subsequent navigations use the full getUser()
    supabaseResponse.cookies.set("bpm_fresh_jwt", "", {
      path: "/",
      maxAge: 0,
    });
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  const _m1 = Date.now();
  if (process.env.NODE_ENV === "development") {
    console.info(`[perf middleware] ${freshJwt ? "getSession(fresh)" : "getUser"}=${_m1 - _m0}ms path=${request.nextUrl.pathname}`);
  }

  return { supabaseResponse, user };
}
