"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Auth callback page — handles Supabase email confirmation, magic links,
 * and OAuth redirects.
 *
 * Client-side so it can read both:
 *  - PKCE authorization codes (query parameter `?code=...`)
 *  - Implicit-flow tokens (URL hash `#access_token=...`)
 *
 * On success:  redirect to the `next` target (default /onboarding).
 * On failure:  redirect to /login?confirmed=1 (email was confirmed by
 *              Supabase before it redirected here, so the user just needs
 *              to sign in manually).
 */
export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/onboarding";
    const supabase = createClient();

    function clearDevCookies() {
      document.cookie = "dev_role=; path=/; max-age=0";
      document.cookie = "dev_student_id=; path=/; max-age=0";
    }

    function goToApp() {
      clearDevCookies();
      router.push(next);
      router.refresh();
    }

    function goToLogin() {
      router.push("/login?confirmed=1");
    }

    async function handle() {
      // 1. PKCE flow — exchange authorization code for session
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          goToApp();
          return;
        }
        // Exchange failed (e.g. code_verifier cookie lost due to
        // different browser/port). Email IS confirmed — send the
        // user to login with a success message.
        goToLogin();
        return;
      }

      // 2. Implicit / token-hash flow — the Supabase browser client
      //    auto-detects tokens in the URL hash on initialisation.
      //    Check if a session was already established.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        goToApp();
        return;
      }

      // 3. Wait briefly for onAuthStateChange (hash processing can
      //    be asynchronous in some Supabase client versions).
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event) => {
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            subscription.unsubscribe();
            goToApp();
          }
        }
      );

      // 4. Timeout — nothing fired, redirect to login with success.
      setTimeout(() => {
        subscription.unsubscribe();
        goToLogin();
      }, 4000);
    }

    handle();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
      <p className="text-sm text-gray-500">Completing sign-in...</p>
    </div>
  );
}
