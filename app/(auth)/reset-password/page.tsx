"use client";

import { useState } from "react";
import Link from "next/link";
/* eslint-disable @next/next/no-img-element */
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const form = new FormData(e.currentTarget);
    const email = (form.get("email") as string)?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      setIsPending(false);
      return;
    }

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm?next=/update-password`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo }
    );

    if (resetError) {
      setError(resetError.message);
      setIsPending(false);
      return;
    }

    setSent(true);
    setIsPending(false);
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle2 className="h-12 w-12 text-indigo-500" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Check your email
            </h2>
            <p className="mt-2 text-center text-sm text-gray-500">
              If an account exists with that email, we&apos;ve sent a link to
              set your password. Check your inbox and spam folder.
            </p>
            <Link
              href="/login"
              className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Back to sign in
            </Link>
          </CardContent>
        </Card>
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
              className="h-14 w-auto object-contain"
            />
            <h1 className="mt-4 text-xl font-bold text-gray-900">
              Reset Password
            </h1>
            <p className="mt-1 text-center text-sm text-gray-500">
              Enter your email and we&apos;ll send you a link to set your
              password.
            </p>
          </div>

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
                required
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Sending..." : "Send reset link"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            <Link
              href="/login"
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
