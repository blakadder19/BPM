"use server";

/**
 * Admin → Students: send a Supabase Auth magic login link.
 *
 * This action lets an authorised admin trigger the same magic-link
 * email that Supabase's own dashboard sends to a user, without ever
 * exposing the raw link to the admin. The flow is:
 *
 *   1. Server-side permission check (`students:send_magic_link`).
 *   2. Resolve the student → email.
 *   3. Call `supabase.auth.signInWithOtp({ email, shouldCreateUser: false })`
 *      so Supabase emails the student a one-time-use link.
 *   4. Audit log a masked record (no email, no token, no link).
 *
 * Privacy / safety contract:
 *   * NEVER log the raw email, full magic link, token_hash, OTP,
 *     access_token, or refresh_token. We mask the email for any log
 *     line so logs are safe to share with support.
 *   * NEVER return the magic link to the caller — Supabase doesn't
 *     hand it back through signInWithOtp; we explicitly avoid the
 *     admin-only `generateLink` path so there is no link to leak.
 *   * NEVER fall back to BPM's own email provider (Brevo) — the link
 *     must come from Supabase Auth's own SMTP relay so the
 *     token_hash matches what /auth/callback knows how to verify.
 *
 * Rate-limit handling: Supabase enforces server-side rate limits
 * (`429` / "over_email_send_rate_limit" / "over_request_rate_limit").
 * We pass those through as a friendly "please wait" message rather
 * than the raw provider error.
 */

import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import { getStudentRepo } from "@/lib/repositories";
import { maskEmail } from "@/lib/utils/auth-diagnostics";

// ── URL resolution ───────────────────────────────────────────

/**
 * Resolve the app's base URL from the incoming request headers, with
 * a `NEXT_PUBLIC_APP_URL` fallback for non-request contexts. Mirrors
 * the helper in `lib/actions/stripe-checkout.ts` so callback URLs
 * stay consistent across the codebase.
 */
async function resolveAppUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? "https";
      return `${proto}://${host}`;
    }
  } catch {
    // headers() unavailable outside a request context — fall through
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// ── Supabase client ──────────────────────────────────────────

/**
 * Per-request anon client used to call Supabase Auth on behalf of an
 * admin. Not the shared service-role admin client because:
 *
 *   * `signInWithOtp` doesn't require service-role privileges.
 *   * The admin client is a long-lived module singleton with
 *     `persistSession=false`, which is correct for service-role data
 *     access but unnecessary for a stateless auth-only call.
 *
 * We create a fresh client per call (no caching) so two simultaneous
 * actions never share auth state.
 */
function createAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// ── Result shape ─────────────────────────────────────────────

export interface SendMagicLinkResult {
  success: boolean;
  /** Surfaced to the UI when success is true. Masked, never raw. */
  emailMasked?: string;
  error?: string;
}

// ── Server action ────────────────────────────────────────────

const RATE_LIMIT_MESSAGE =
  "Too many login link requests for this student. Please wait a minute and try again.";

const NO_ACCOUNT_MESSAGE =
  "This student does not have a login account yet. Ask them to sign up using the same email first.";

const NO_EMAIL_MESSAGE = "This student does not have an email address.";

/**
 * Send a Supabase Auth magic login link to the student identified by
 * `studentId`. Returns a result object — the magic link itself is
 * never returned, even on success.
 */
export async function sendStudentMagicLinkAction(
  studentId: string,
): Promise<SendMagicLinkResult> {
  // 1) Permission gate — server-side, defence-in-depth so a forged
  //    form post from a user without the permission is rejected.
  const guard = await requirePermissionForAction("students:send_magic_link");
  if (!guard.ok) {
    return { success: false, error: guard.error };
  }
  const admin = guard.access.user;

  if (!studentId || typeof studentId !== "string") {
    return { success: false, error: "Missing student id." };
  }

  // 2) Resolve the student.
  let student;
  try {
    student = await getStudentRepo().getById(studentId);
  } catch (e) {
    console.warn(
      `[magic-link] performer=${admin.id} studentId=${studentId} repo lookup threw: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { success: false, error: "Could not look up the student. Please try again." };
  }
  if (!student) {
    return { success: false, error: "Student not found." };
  }

  const email = (student.email ?? "").trim();
  if (!email) {
    auditMagicLink({
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.fullName,
      studentId,
      emailMasked: maskEmail(student.email),
      outcome: "no_email",
    });
    return { success: false, error: NO_EMAIL_MESSAGE };
  }

  // 3) Build the callback URL the magic link should redirect to.
  //    Matches the existing /auth/callback handler in
  //    app/(auth)/auth/callback/page.tsx which already knows how to
  //    verify a token_hash and finalise the session, then forward to
  //    `next`.
  const appUrl = await resolveAppUrl();
  const emailRedirectTo = `${appUrl}/auth/callback?next=/dashboard`;

  // 4) Send the OTP. `shouldCreateUser: false` is critical:
  //    we never want an admin action to silently provision a new
  //    Auth user — if there's no Auth account for this email we
  //    surface the "ask them to sign up" message instead.
  const supabase = createAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
    },
  });

  if (error) {
    const code = error.code ?? "";
    const status = error.status ?? 0;
    const message = error.message ?? "";

    // Rate limit — surface a friendly wait message.
    if (
      status === 429 ||
      code === "over_email_send_rate_limit" ||
      code === "over_request_rate_limit" ||
      /rate limit/i.test(message)
    ) {
      auditMagicLink({
        adminId: admin.id,
        adminEmail: admin.email,
        adminName: admin.fullName,
        studentId,
        emailMasked: maskEmail(email),
        outcome: "rate_limited",
      });
      return { success: false, error: RATE_LIMIT_MESSAGE };
    }

    // Supabase signals "no such Auth user" via various error codes
    // depending on version: `otp_disabled`, `user_not_found`, etc.
    // We treat anything that mentions "signup" / "not found" /
    // "disabled" as the no-account case so admins get a useful hint.
    if (
      code === "otp_disabled" ||
      code === "user_not_found" ||
      code === "signup_disabled" ||
      /signup/i.test(message) ||
      /not\s+found/i.test(message)
    ) {
      auditMagicLink({
        adminId: admin.id,
        adminEmail: admin.email,
        adminName: admin.fullName,
        studentId,
        emailMasked: maskEmail(email),
        outcome: "no_auth_account",
      });
      return { success: false, error: NO_ACCOUNT_MESSAGE };
    }

    // Fallback — log structured diagnostics (no PII beyond mask) and
    // surface the Supabase message so the admin has something to act
    // on. We deliberately do NOT include `email`, `token_hash` or
    // request URL.
    console.warn(
      `[magic-link] performer=${admin.id} studentId=${studentId} emailMasked=${maskEmail(email)} send FAILED code=${code || "?"} status=${status || "?"} message=${message}`,
    );
    auditMagicLink({
      adminId: admin.id,
      adminEmail: admin.email,
      adminName: admin.fullName,
      studentId,
      emailMasked: maskEmail(email),
      outcome: "error",
      errorCode: code || null,
    });
    return {
      success: false,
      error: message || "Could not send the magic login link. Please try again.",
    };
  }

  // 5) Success — log a structured audit entry (no email, no link).
  auditMagicLink({
    adminId: admin.id,
    adminEmail: admin.email,
    adminName: admin.fullName,
    studentId,
    emailMasked: maskEmail(email),
    outcome: "sent",
  });

  return { success: true, emailMasked: maskEmail(email) };
}

// ── Audit logging ────────────────────────────────────────────

type AuditOutcome =
  | "sent"
  | "no_email"
  | "no_auth_account"
  | "rate_limited"
  | "error";

interface AuditPayload {
  adminId: string;
  adminEmail: string | null | undefined;
  adminName: string | null | undefined;
  studentId: string;
  emailMasked: string;
  outcome: AuditOutcome;
  errorCode?: string | null;
}

/**
 * Single source of truth for the "magic link sent" audit line.
 *
 * We use `console.info` rather than the finance audit log because
 * sending a login link is an operational event, not a financial one.
 * The shape is fixed so log shipping / Datadog / Loki queries can
 * extract `action=send_magic_link` deterministically.
 *
 * Fields intentionally never logged: raw email, magic link URL,
 * token_hash, OTP value, access_token, refresh_token, IP address.
 */
function auditMagicLink(payload: AuditPayload): void {
  const performer =
    payload.adminName || payload.adminEmail || payload.adminId || "unknown";
  console.info(
    `[admin-audit] action=send_magic_link outcome=${payload.outcome} ` +
      `performer=${performer} performerId=${payload.adminId} ` +
      `studentId=${payload.studentId} studentEmailMasked=${payload.emailMasked} ` +
      `errorCode=${payload.errorCode ?? "—"} ts=${new Date().toISOString()}`,
  );
}
