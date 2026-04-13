"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { provisionCurrentUser } from "@/lib/actions/auth-provision";

/**
 * Auth callback page — handles Supabase email confirmation, magic links,
 * OAuth redirects, and password recovery sessions.
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
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const rawNext = searchParams.get("next") ?? "/onboarding";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/onboarding";
    const supabase = createClient();

    function clearDevCookies() {
      document.cookie = "dev_role=; path=/; max-age=0";
      document.cookie = "dev_student_id=; path=/; max-age=0";
    }

    function goToRecovery() {
      router.push("/update-password");
      router.refresh();
    }

    async function goToApp() {
      clearDevCookies();
      const provResult = await provisionCurrentUser().catch((e) => {
        console.error("[auth-callback] provisionCurrentUser threw:", e);
        return { success: false, error: String(e) };
      });
      if (!provResult.success) {
        console.warn("[auth-callback] provisioning failed:", provResult.error);
      }
      router.push(next);
      router.refresh();
    }

    function goToLogin() {
      router.push("/login?confirmed=1");
    }

    async function handle() {
      // Handle modern token_hash verification (Supabase email-link format)
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "recovery" | "email",
        });
        if (!error) {
          if (type === "recovery") {
            goToRecovery();
            return;
          }
          await goToApp();
          return;
        }
        goToLogin();
        return;
      }

      // Handle PKCE code exchange
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          // After code exchange for recovery, Supabase establishes a
          // recovery session. Check if next points to update-password.
          if (next === "/update-password") {
            goToRecovery();
            return;
          }
          await goToApp();
          return;
        }
        goToLogin();
        return;
      }

      // Fallback: check for existing session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await goToApp();
        return;
      }

      // Listen for auth state changes (handles hash-fragment flows)
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          subscription.unsubscribe();
          goToRecovery();
          return;
        }
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          subscription.unsubscribe();
          goToApp();
        }
      });

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
