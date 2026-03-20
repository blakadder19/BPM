"use client";

import { useEffect } from "react";

/**
 * Checks for Supabase auth cookies set by the browser client during login.
 * These are non-httpOnly cookies written via document.cookie by
 * @supabase/ssr's createBrowserClient, so they are always readable here.
 * Pattern: sb-<project-ref>-auth-token (possibly chunked: .0, .1, …)
 */
function hasSupabaseCookies(): boolean {
  return /sb-.+-auth-token/.test(document.cookie);
}

function ejectToLogin() {
  document.documentElement.style.visibility = "hidden";
  window.location.replace("/login");
}

/**
 * Client-side session guard for the protected app shell.
 *
 * Detects logout by checking whether Supabase auth cookies still exist in
 * `document.cookie`. Those cookies are set client-side during login (before
 * any navigation) and cleared server-side during signOut, so they are a
 * reliable signal for the current auth state.
 *
 * On popstate (browser back/forward), BFCache restore, or tab reactivation:
 * hides the page first (to prevent stale content flash), then checks. If
 * cookies are gone, hard-navigates to /login via window.location.replace()
 * so the back button cannot return to the protected page.
 */
export function SessionGuard() {
  useEffect(() => {
    function softCheck() {
      if (!hasSupabaseCookies()) ejectToLogin();
    }

    function hardCheck() {
      document.documentElement.style.visibility = "hidden";
      if (!hasSupabaseCookies()) {
        ejectToLogin();
      } else {
        document.documentElement.style.visibility = "visible";
      }
    }

    // Initial mount: soft check (server already verified auth for this render)
    softCheck();

    // Back/forward navigation: hide first, then verify
    window.addEventListener("popstate", hardCheck);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) hardCheck();
    };
    window.addEventListener("pageshow", onPageShow);

    const onVisibility = () => {
      if (document.visibilityState === "visible") softCheck();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("popstate", hardCheck);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Ensure content is visible after every normal render
  useEffect(() => {
    document.documentElement.style.visibility = "visible";
  });

  return null;
}
