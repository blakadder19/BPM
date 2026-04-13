"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const DEMO_USERS = [
  { label: "Admin", email: "admin@bpm.dance" },
  { label: "Teacher", email: "teacher@bpm.dance" },
  { label: "Student", email: "student@bpm.dance" },
];

function safeRedirectPath(raw: string): string {
  if (!raw) return "/dashboard";
  try {
    const url = new URL(raw, "http://localhost");
    return url.pathname + url.search;
  } catch {
    return raw.startsWith("/") ? raw : "/dashboard";
  }
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const callbackError = searchParams.get("error");
  const confirmed = searchParams.get("confirmed") === "1";

  const [error, setError] = useState<string | null>(
    callbackError === "auth_callback_failed"
      ? "Authentication failed. Please try again."
      : null
  );
  const [isPending, setIsPending] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const destination = safeRedirectPath(next);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = destination;
      }
    });
  }, [destination]);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (!email || !password) {
      setError("Email and password are required.");
      setIsPending(false);
      return;
    }

    const t0 = performance.now();
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    const t1 = performance.now();

    if (authError) {
      setError(authError.message);
      setIsPending(false);
      return;
    }

    if (process.env.NODE_ENV === "development") console.info(`[perf login] signIn=${(t1-t0).toFixed(0)}ms — navigating to ${destination}`);
    setIsNavigating(true);

    // Signal to middleware that the JWT was just issued and doesn't need
    // the expensive getUser() HTTP validation. Short-lived (10s) cookie
    // that saves ~100-300ms on the very first protected page load.
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `bpm_fresh_jwt=1; path=/; max-age=10; SameSite=Lax${secure}`;

    // Use hard navigation instead of router.push(). After login, the
    // browser has no prefetched RSC payload for the protected route, so
    // router.push() would wait for the full RSC roundtrip before showing
    // anything. A hard navigation leverages SSR streaming — the browser
    // starts rendering HTML as it arrives, giving much faster first-paint.
    window.location.href = destination;
  }, [destination]);

  function fillDemo(email: string) {
    const emailInput = document.getElementById("email") as HTMLInputElement;
    const passwordInput = document.getElementById("password") as HTMLInputElement;
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = "password123";
  }

  if (isNavigating) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        <p className="text-sm font-medium text-gray-600">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-8 pb-8">
          <div className="mb-8 flex flex-col items-center">
            <img
              src="/branding/bpm-logo-full.jpg"
              alt="BPM"
              className="h-20 w-auto object-contain"
            />
            <h1 className="mt-4 text-xl font-bold text-gray-900">
              Sign in
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to manage your dance classes
            </p>
          </div>

          {confirmed && !error && (
            <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              Email confirmed successfully. Please sign in.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm">
            <Link
              href="/signup"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Create account
            </Link>
            <Link
              href="/reset-password"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Forgot password?
            </Link>
          </div>

          {process.env.NODE_ENV === "development" && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-3 text-center text-xs font-medium text-gray-400">
                DEV ONLY — DEMO ACCOUNTS (password: password123)
              </p>
              <div className="flex gap-2">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => fillDemo(user.email)}
                    className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    {user.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
