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

    async function goToRecovery() {
      // Provision even for recovery — records auth_linked_at for
      // admin-created students claiming their account via password reset.
      await provisionCurrentUser().catch((e) => {
        console.error("[auth-callback] provisionCurrentUser (recovery):", e);
      });
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

    const isEmailConfirmation = type === "signup" || type === "email" || type === "email_change";

    function goToLogin() {
      router.push("/login?confirmed=1");
    }

    async function handleConfirmation() {
      // Provision BEFORE signing out so auth_linked_at is set for
      // self-signup students (the login-page provisioning can fail
      // if session cookies aren't propagated in time).
      await provisionCurrentUser().catch((e) => {
        console.error("[auth-callback] provisionCurrentUser (confirmation):", e);
      });
      await supabase.auth.signOut().catch(() => {});
      goToLogin();
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
          if (isEmailConfirmation) {
            await handleConfirmation();
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
          if (next === "/update-password") {
            goToRecovery();
            return;
          }
          if (isEmailConfirmation) {
            await handleConfirmation();
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bpm-auth-bg">
      <Loader2 className="h-6 w-6 animate-spin text-white" />
      <p className="text-sm text-white/80">Completing sign-in...</p>
    </div>
  );
}
