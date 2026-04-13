"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
/* eslint-disable @next/next/no-img-element */
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsPending(true);

    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirmPassword = form.get("confirmPassword") as string;

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      setIsPending(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsPending(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setIsPending(false);
      return;
    }

    setSuccess(true);
    setIsPending(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
        <Card className="w-full max-w-sm shadow-xl">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Password updated
            </h2>
            <p className="mt-2 text-center text-sm text-gray-500">
              Your password has been set. You can now sign in with your new
              password.
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                router.push("/dashboard");
                router.refresh();
              }}
            >
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="pt-8 pb-8">
          <div className="mb-8 flex flex-col items-center">
            <img
              src="/branding/bpm-logo-full.jpg"
              alt="BPM"
              className="h-20 w-auto object-contain"
            />
            <h1 className="mt-4 font-display text-xl font-bold text-gray-900">
              Set Your Password
            </h1>
            <p className="mt-1 text-center text-sm text-gray-500">
              Choose a new password for your BPM account.
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
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                New password
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
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={6}
                placeholder="Repeat your password"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-bpm-500 focus:outline-none focus:ring-2 focus:ring-bpm-100"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Updating..." : "Set password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
