"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(
    searchParams.get("awaiting") === "1"
  );

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
    const dateOfBirth = (form.get("dateOfBirth") as string) || null;
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

    if (authError) {
      setError(authError.message);
      setIsPending(false);
      return;
    }

    // If Supabase returned a session, the user is auto-confirmed
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }

    // No session means email confirmation is required.
    // Push state into the URL so the confirmation screen survives refresh.
    setConfirmationSent(true);
    setIsPending(false);
    router.replace("/signup?awaiting=1");
  }

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle2 className="h-12 w-12 text-indigo-500" />
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              Check your email
            </h2>
            <p className="mt-2 text-center text-sm text-gray-500">
              We sent a confirmation link to your email address.
              Click the link to activate your account and start booking classes.
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
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8">
          <div className="mb-8 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
              <Music className="h-6 w-6 text-white" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">
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
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label htmlFor="preferredRole" className="block text-sm font-medium text-gray-700">
                Preferred dance role
              </label>
              <select
                id="preferredRole"
                name="preferredRole"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">No preference</option>
                <option value="leader">Leader</option>
                <option value="follower">Follower</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">
                  Date of birth
                  <span className="ml-1 text-xs text-gray-400">(optional)</span>
                </label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
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
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account…" : "Create Account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
