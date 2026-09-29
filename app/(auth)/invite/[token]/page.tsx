import Link from "next/link";
import { CheckCircle2, AlertTriangle, LogIn, XCircle } from "lucide-react";
import { acceptStaffInviteByTokenAction } from "@/lib/actions/staff-invite-accept";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Phase 18 — staff invitation acceptance page.
 *
 * The invite email links here. Acceptance runs server-side on render
 * (it is idempotent and permission-checked), so the visitor lands on
 * a page that already tells them the outcome.
 *
 * Why a Server Component rather than a button: the overwhelmingly
 * common case is "already signed in, clicked the link" — making them
 * click a second button to finish would reintroduce the friction that
 * caused the original bug, where following the link appeared to do
 * nothing.
 *
 * Every failure mode gets its own message:
 *   not_authenticated → sign-in link that returns here afterwards
 *   email_mismatch    → names both emails so they know which to use
 *   expired/revoked   → tells them to ask for a new invite
 *   already_accepted  → reassurance, not an error
 */
export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await acceptStaffInviteByTokenAction(token);

  // Preserve the invite URL across sign-in so the user returns here
  // and the acceptance completes without them hunting for the email.
  const returnTo = `/invite/${encodeURIComponent(token)}`;
  const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;

  const isSuccess =
    result.outcome === "accepted" ||
    result.outcome === "already_accepted" ||
    result.outcome === "already_super_admin";
  const needsSignIn = result.outcome === "not_authenticated";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            {isSuccess ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            ) : needsSignIn ? (
              <LogIn className="mt-0.5 h-6 w-6 shrink-0 text-bpm-600" />
            ) : result.outcome === "error" ? (
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            ) : (
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-gray-900">
                {result.outcome === "accepted"
                  ? "Invitation accepted"
                  : result.outcome === "already_accepted"
                    ? "Already accepted"
                    : result.outcome === "already_super_admin"
                      ? "No change needed"
                      : needsSignIn
                        ? `Sign in to accept${result.roleLabel ? ` your ${result.roleLabel} invitation` : ""}`
                        : result.outcome === "email_mismatch"
                          ? "Wrong account"
                          : result.outcome === "expired"
                            ? "Invitation expired"
                            : result.outcome === "revoked"
                              ? "Invitation cancelled"
                              : result.outcome === "not_found"
                                ? "Invitation not found"
                                : "Something went wrong"}
              </h1>
              <p className="mt-1 text-sm text-gray-600">{result.message}</p>
            </div>
          </div>

          {result.outcome === "accepted" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Your existing account is unchanged — if you also book classes as
              a student, that continues to work exactly as before. You now have
              staff tools in addition.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {needsSignIn ? (
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700"
              >
                Sign in
              </Link>
            ) : isSuccess ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700"
              >
                Go to dashboard
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Go to dashboard
              </Link>
            )}
            {result.outcome === "email_mismatch" && (
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Switch account
              </Link>
            )}
          </div>

          {result.outcome === "accepted" && (
            <p className="text-xs text-gray-500">
              If the new menu items do not appear straight away, sign out and
              back in to refresh your session.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
