"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { provisionCurrentUser } from "@/lib/actions/auth-provision";

/**
 * Auth callback page — handles Supabase email confirmation, magic links,
 * and OAuth redirects.
 *
 * After establishing a session, calls provisionCurrentUser() to ensure
 * the user has public.users + student_profiles rows (one-time, idempotent).
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

    async function goToApp() {
      clearDevCookies();
      // Provision profile rows before entering the app
      await provisionCurrentUser().catch(() => {});
      router.push(next);
      router.refresh();
    }

    function goToLogin() {
      router.push("/login?confirmed=1");
    }

    async function handle() {
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          await goToApp();
          return;
        }
        goToLogin();
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await goToApp();
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event) => {
          if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
            subscription.unsubscribe();
            goToApp();
          }
        }
      );

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
