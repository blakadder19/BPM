"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signIn } from "@/lib/actions/auth";

const DEMO_USERS = [
  { label: "Admin", email: "admin@bpm.dance" },
  { label: "Teacher", email: "maria@bpm.dance" },
  { label: "Student", email: "alice@test.com" },
];

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const callbackError = searchParams.get("error");

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error: string | null }, formData: FormData) => {
      return signIn(formData);
    },
    { error: callbackError === "auth_callback_failed" ? "Authentication failed. Please try again." : null }
  );

  function fillDemo(email: string) {
    const emailInput = document.getElementById("email") as HTMLInputElement;
    const passwordInput = document.getElementById("password") as HTMLInputElement;
    if (emailInput) emailInput.value = email;
    if (passwordInput) passwordInput.value = "password123";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-8 pb-8">
          <div className="mb-8 flex flex-col items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
              <Music className="h-6 w-6 text-white" />
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">
              BPM Booking
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Sign in to manage your dance classes
            </p>
          </div>

          {state.error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
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
                required
                placeholder="••••••••"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 border-t border-gray-100 pt-4">
            <p className="mb-3 text-center text-xs font-medium text-gray-400">
              DEMO ACCOUNTS (password: password123)
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
        </CardContent>
      </Card>
    </div>
  );
}
