"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { provisionCurrentUser } from "@/lib/actions/auth-provision";
import {
  maskEmail,
  emailDomain,
  newSignupAttemptId,
  safeRedirectTarget,
} from "@/lib/utils/auth-diagnostics";

/**
 * sessionStorage key used to remember the most recent signup attempt
 * so the "Check your email" waiting screen can still offer Resend
 * after a hard refresh (the router.replace soft-nav preserves React
 * state, but a manual reload would clear it). sessionStorage is tab-
 * scoped and never sent over the network, so a masked email + an
 * attempt id is the worst that can leak.
 */
const SIGNUP_SESSION_KEY = "bpm:signup:lastAttempt";

interface LastSignupAttempt {
  /** Raw email — needed to call `supabase.auth.resend`. Stored tab-local only. */
  email: string;
  attemptId: string;
  callbackUrl: string;
}

function readLastSignupAttempt(): LastSignupAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastSignupAttempt>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.attemptId !== "string" ||
      typeof parsed.callbackUrl !== "string"
    ) {
      return null;
    }
    return parsed as LastSignupAttempt;
  } catch {
    return null;
  }
}

function writeLastSignupAttempt(attempt: LastSignupAttempt | null): void {
  if (typeof window === "undefined") return;
  try {
    if (attempt === null) {
      window.sessionStorage.removeItem(SIGNUP_SESSION_KEY);
    } else {
      window.sessionStorage.setItem(SIGNUP_SESSION_KEY, JSON.stringify(attempt));
    }
  } catch {
    // sessionStorage can throw in privacy modes; non-fatal.
  }
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(
    searchParams.get("awaiting") === "1"
  );
  const [existingEmail, setExistingEmail] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<LastSignupAttempt | null>(null);

  // Resend state — kept on the page so it survives the soft nav from
  // `router.replace("/signup?awaiting=1")`. Cooldown is purely client-
  // side UX guardrail (Supabase already rate-limits server-side).
  const [resendPending, setResendPending] = useState(false);
  const [resendMessage, setResendMessage] = useState<
    | { kind: "success"; text: string }
    | { kind: "error"; text: string }
    | null
  >(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Restore the last attempt on mount so a manual reload of
  // /signup?awaiting=1 still shows the attempt id and enables Resend.
  useEffect(() => {
    if (confirmationSent && !lastAttempt) {
      setLastAttempt(readLastSignupAttempt());
    }
  }, [confirmationSent, lastAttempt]);

  // Tick the cooldown countdown.
  useEffect(() => {
    if (!resendCooldownUntil) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [resendCooldownUntil]);

  const cooldownSecondsLeft =
    resendCooldownUntil && resendCooldownUntil > now
      ? Math.ceil((resendCooldownUntil - now) / 1000)
      : 0;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const form = new FormData(e.currentTarget);
    const firstName = (form.get("firstName") as string)?.trim();
    const lastName = (form.get("lastName") as string)?.trim();
    const email = (form.get("email") as string)?.trim();
    const password = form.get("password") as string;
    const preferredRole = (form.get("preferredRole") as string) || null;
    const dobMonth = form.get("dobMonth") as string;
    const dobDay = form.get("dobDay") as string;
    const dateOfBirth =
      dobMonth && dobDay
        ? `${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`
        : null;
    const phone = (form.get("phone") as string)?.trim() || null;

    if (!firstName || !lastName) {
      setError("First name and last name are required.");
      setIsPending(false);
      return;
    }
    if (!email || !email.includes("@")) {
      setError("A valid email is required.");
      setIsPending(false);
      return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      setIsPending(false);
      return;
    }

    const supabase = createClient();
    const callbackUrl = `${window.location.origin}/auth/callback?next=/onboarding`;
    const redirectOrigin = window.location.origin;
    const attemptId = newSignupAttemptId();
    const domain = emailDomain(email);

    // ── DIAGNOSTICS — start ────────────────────────────────────
    // Investigation of the 10–15 min signup-email delay. We log
    // attempt id + domain + redirect ORIGIN (no full URL → no
    // token leakage) so support can correlate user reports with
    // Supabase Auth logs and Brevo transactional logs. The full
    // email is never logged.
    console.info(
      `[signup] start attemptId=${attemptId} emailMasked=${maskEmail(email)} domain=${domain} redirectOrigin=${redirectOrigin} ts=${new Date().toISOString()}`,
    );

    const _t0 = performance.now();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl,
        data: {
          full_name: `${firstName} ${lastName}`,
          first_name: firstName,
          last_name: lastName,
          role: "student",
          preferred_role: preferredRole,
          date_of_birth: dateOfBirth,
          phone,
        },
      },
    });
    const _t1 = performance.now();
    const signUpDurationMs = Math.round(_t1 - _t0);

    if (authError) {
      console.warn(
        `[signup] attemptId=${attemptId} supabase.auth.signUp returned ERROR durationMs=${signUpDurationMs} code=${authError.code ?? "?"} status=${authError.status ?? "?"} message=${authError.message}`,
      );
      setError(authError.message);
      setIsPending(false);
      return;
    }

    // Detect existing email: Supabase returns a user with empty identities
    // when the email is already registered (e.g. admin-created student).
    const existingEmailDetected =
      !!data.user && (!data.user.identities || data.user.identities.length === 0);
    const hasSession = !!data.session;
    const hasUser = !!data.user;
    const confirmationRequired = hasUser && !hasSession && !existingEmailDetected;

    // ── DIAGNOSTICS — result ───────────────────────────────────
    // This is the single most useful line for the investigation:
    //   * `durationMs` answers "is Supabase slow to accept the
    //     signup?" — if it's <2s the bottleneck is downstream
    //     (SMTP → Brevo → recipient).
    //   * `confirmationRequired=true` confirms the email path is
    //     active.
    //   * `existingEmail=true` explains "I never got an email" —
    //     no email is generated for an already-registered address.
    console.info(
      `[signup] attemptId=${attemptId} supabase.signUp returned durationMs=${signUpDurationMs} hasUser=${hasUser} hasSession=${hasSession} confirmationRequired=${confirmationRequired} existingEmail=${existingEmailDetected} redirectTarget=${safeRedirectTarget(callbackUrl)}`,
    );
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[perf signup] signUp=${signUpDurationMs}ms attemptId=${attemptId}`,
      );
    }

    if (existingEmailDetected) {
      setExistingEmail(true);
      setIsPending(false);
      return;
    }

    // If Supabase returned a session, the user is auto-confirmed
    if (data.session) {
      console.info(
        `[signup] attemptId=${attemptId} auto-confirmed (session returned). Email confirmation is OFF in Supabase Auth → Settings.`,
      );
      await provisionCurrentUser().catch((e) =>
        console.error("[signup] provisionCurrentUser threw:", e)
      );
      router.push("/onboarding");
      router.refresh();
      return;
    }

    // No session means email confirmation is required.
    //
    // The send is handed off to Supabase Auth's SMTP relay (Brevo in
    // production per supabase/config.toml / Dashboard → Auth → SMTP).
    // BPM's own BREVO_API_KEY is NOT involved here; do not look in
    // `lib/communications/email-provider.ts` logs for this email.
    //
    // To diagnose a delivery delay after this log line:
    //   1. Supabase Dashboard → Authentication → Logs — find the
    //      `signup` event for this user id and check the SMTP send
    //      status / timestamp.
    //   2. Brevo Dashboard → Transactional → Logs — search the
    //      recipient email; check accepted/delivered timestamps.
    //   See docs/diagnostics/signup-email-delay.md for the full
    //   triage runbook.
    console.info(
      `[signup] attemptId=${attemptId} confirmation email expected userId=${data.user?.id ?? "?"} domain=${domain} redirectTarget=${safeRedirectTarget(callbackUrl)}. ` +
        "Email send is owned by Supabase Auth SMTP (NOT BPM/BREVO_API_KEY). " +
        "See docs/diagnostics/signup-email-delay.md for triage.",
    );

    const attempt: LastSignupAttempt = { email, attemptId, callbackUrl };
    writeLastSignupAttempt(attempt);
    setLastAttempt(attempt);
    setConfirmationSent(true);
    setIsPending(false);
    setResendCooldownUntil(Date.now() + 60_000);
    setNow(Date.now());
    router.replace("/signup?awaiting=1");
  }

  async function handleResend() {
    if (!lastAttempt) return;
    if (cooldownSecondsLeft > 0) return;
    setResendPending(true);
    setResendMessage(null);

    const supabase = createClient();
    const _t0 = performance.now();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: lastAttempt.email,
      options: { emailRedirectTo: lastAttempt.callbackUrl },
    });
    const _t1 = performance.now();
    const durationMs = Math.round(_t1 - _t0);

    if (resendError) {
      console.warn(
        `[signup] attemptId=${lastAttempt.attemptId} resend ERROR durationMs=${durationMs} code=${resendError.code ?? "?"} status=${resendError.status ?? "?"} message=${resendError.message}`,
      );
      setResendMessage({
        kind: "error",
        text: resendError.message || "Could not resend right now. Please try again in a minute.",
      });
    } else {
      console.info(
        `[signup] attemptId=${lastAttempt.attemptId} resend OK durationMs=${durationMs} domain=${emailDomain(lastAttempt.email)} redirectTarget=${safeRedirectTarget(lastAttempt.callbackUrl)}`,
      );
      setResendMessage({
        kind: "success",
        text: "Confirmation email re-sent. Please check your inbox and spam folder.",
      });
    }

    setResendPending(false);
    setResendCooldownUntil(Date.now() + 60_000);
    setNow(Date.now());
  }

  if (existingEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle2 className="h-12 w-12 text-amber-500" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Account already exists
            </h2>
            <p className="mt-2 text-center text-sm text-gray-500">
              An account with this email already exists. If you were added by
              BPM, you can set your own password to get started.
            </p>
            <Link
              href="/reset-password"
              className="mt-6 inline-flex items-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-500"
            >
              Set your password
            </Link>
            <Link
              href="/login"
              className="mt-3 text-sm font-medium text-bpm-600 hover:text-bpm-500"
            >
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (confirmationSent) {
    const canResend = !!lastAttempt && !resendPending && cooldownSecondsLeft === 0;
    return (
      <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="flex flex-col items-center py-12 px-6">
            <CheckCircle2 className="h-12 w-12 text-bpm-500" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Check your email
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Please check your email to confirm your account. It can take a
              few minutes. Please also check spam or promotions.
            </p>
            {lastAttempt && (
              <p className="mt-2 text-center text-xs text-gray-400">
                Sent to {maskEmail(lastAttempt.email)}
              </p>
            )}

            {/*
             * Resend confirmation email. Useful both as a UX safety
             * net and as a diagnostic — each click emits another
             * `[signup] resend …` log line we can match against
             * Supabase Auth logs / Brevo logs to time the next
             * delivery attempt.
             *
             * Cooldown is purely client-side (60s) to keep users
             * from spamming the button; Supabase still rate-limits
             * server-side regardless.
             */}
            {lastAttempt && (
              <div className="mt-6 flex w-full flex-col items-center gap-2">
                <Button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend}
                  className="w-full"
                  variant="outline"
                >
                  {resendPending
                    ? "Resending…"
                    : cooldownSecondsLeft > 0
                      ? `Resend confirmation email (${cooldownSecondsLeft}s)`
                      : "Resend confirmation email"}
                </Button>
                {resendMessage && (
                  <p
                    className={`text-xs text-center ${
                      resendMessage.kind === "success"
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {resendMessage.text}
                  </p>
                )}
              </div>
            )}

            <Link
              href="/login"
              className="mt-6 text-sm font-medium text-bpm-600 hover:text-bpm-500"
            >
              Back to sign in
            </Link>

            {lastAttempt && (
              <p className="mt-6 text-center text-[10px] text-gray-400">
                Reference: <span className="font-mono">{lastAttempt.attemptId}</span>
                <br />
                Share this code with support if your email never arrives.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardContent className="pt-8 pb-8">
          <div className="mb-8 flex flex-col items-center">
            <img
              src="/branding/bpm-logo-full.jpg"
              alt="BPM"
              className="h-20 w-auto object-contain"
            />
            <h1 className="mt-4 font-display text-xl font-bold text-gray-900">
              Create Account
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Join BPM to book your dance classes
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="At least 6 characters"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
              />
            </div>

            <div>
              <label htmlFor="preferredRole" className="block text-sm font-medium text-gray-700">
                Preferred dance role
              </label>
              <select
                id="preferredRole"
                name="preferredRole"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
              >
                <option value="">No preference</option>
                <option value="leader">Leader</option>
                <option value="follower">Follower</option>
              </select>
            </div>

            <div>
              <span className="block text-sm font-medium text-gray-700">
                Birthday (month &amp; day)
                <span className="ml-1 text-xs text-gray-400">(optional)</span>
              </span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select
                  name="dobMonth"
                  aria-label="Birth month"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                >
                  <option value="">Month</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {new Date(2000, i).toLocaleString("en", { month: "long" })}
                    </option>
                  ))}
                </select>
                <select
                  name="dobDay"
                  aria-label="Birth day"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
                >
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone
                <span className="ml-1 text-xs text-gray-400">(optional)</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account…" : "Create Account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-bpm-600 hover:text-bpm-500">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
