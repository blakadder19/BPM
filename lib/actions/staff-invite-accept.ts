"use server";

/**
 * Phase 18 — token-based staff invite acceptance.
 *
 * Replaces the previous arrangement where the invite email pointed at
 * `/login?invite=<token>` and the token was never read by anything.
 * Acceptance relied purely on email-matching during sign-in
 * provisioning, which meant:
 *
 *   * an ALREADY LOGGED-IN recipient was redirected straight to
 *     /dashboard by the login page and their invite was never applied;
 *   * there was no way to tell them WHY nothing happened;
 *   * the token in the URL was decorative.
 *
 * This action is the explicit acceptance step. It is called from
 * `/invite/[token]`, validates every failure mode separately so the
 * page can show a specific message, and is safe to call repeatedly.
 *
 * SECURITY: the token alone is not sufficient. The caller must be
 * authenticated AND their authenticated email must match the invited
 * email (case-insensitively). A leaked link therefore cannot grant
 * staff access to a different account.
 */

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getStaffRepo } from "@/lib/repositories";
import { acceptPendingStaffInviteForUser } from "@/lib/staff-invite-acceptance";
import { STAFF_ROLE_LABELS, type StaffRoleKey } from "@/lib/domain/permissions";

export type InviteAcceptOutcome =
  | "accepted"
  | "already_accepted"
  | "not_found"
  | "revoked"
  | "expired"
  | "not_authenticated"
  | "email_mismatch"
  | "already_super_admin"
  | "error";

export interface InviteAcceptResult {
  outcome: InviteAcceptOutcome;
  /** Human-readable message, safe to render directly. */
  message: string;
  /** The invited role, when the token resolved to a real invite. */
  roleKey?: StaffRoleKey;
  roleLabel?: string;
  /** Email the invite was issued to — shown on mismatch so the user knows which account to use. */
  invitedEmail?: string;
  /** The currently signed-in email, shown on mismatch. */
  currentEmail?: string;
}

export async function acceptStaffInviteByTokenAction(
  token: string,
): Promise<InviteAcceptResult> {
  const cleanToken = (token ?? "").trim();
  if (!cleanToken) {
    return {
      outcome: "not_found",
      message: "This invitation link is not valid.",
    };
  }

  const repo = getStaffRepo();

  let invite;
  try {
    invite = await repo.getInviteByToken(cleanToken);
  } catch (e) {
    console.error("[invite-accept] token lookup failed:", e);
    return {
      outcome: "error",
      message: "We could not check this invitation. Please try again shortly.",
    };
  }

  if (!invite) {
    return {
      outcome: "not_found",
      message:
        "This invitation link is not valid. It may have been replaced by a newer invitation — ask your administrator to resend it.",
    };
  }

  const roleLabel = STAFF_ROLE_LABELS[invite.roleKey];

  // ── Status checks (before auth, so we can explain a dead link
  //    without forcing a pointless sign-in) ──
  if (invite.status === "revoked") {
    return {
      outcome: "revoked",
      message:
        "This invitation has been cancelled. Ask your administrator for a new one.",
      roleKey: invite.roleKey,
      roleLabel,
      invitedEmail: invite.email,
    };
  }

  if (invite.status === "accepted") {
    // Not an error: a recipient re-opening the link from their inbox
    // should see reassurance, not a failure.
    return {
      outcome: "already_accepted",
      message: `This invitation has already been accepted. Your ${roleLabel} access is active — sign in to use it.`,
      roleKey: invite.roleKey,
      roleLabel,
      invitedEmail: invite.email,
    };
  }

  if (invite.expiresAt) {
    const expiresMs = Date.parse(invite.expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return {
        outcome: "expired",
        message:
          "This invitation has expired. Ask your administrator to send a new one.",
        roleKey: invite.roleKey,
        roleLabel,
        invitedEmail: invite.email,
      };
    }
  }

  // ── Authentication ──
  const user = await getAuthUser();
  if (!user) {
    return {
      outcome: "not_authenticated",
      message: `Sign in as ${invite.email} to accept this ${roleLabel} invitation.`,
      roleKey: invite.roleKey,
      roleLabel,
      invitedEmail: invite.email,
    };
  }

  // ── Email match. The token is NOT a bearer credential on its own. ──
  const invitedEmail = invite.email.trim().toLowerCase();
  const currentEmail = (user.email ?? "").trim().toLowerCase();
  if (!currentEmail || currentEmail !== invitedEmail) {
    return {
      outcome: "email_mismatch",
      message: `This invitation was sent to ${invite.email}, but you are signed in as ${user.email || "another account"}. Sign out and sign in with the invited email to accept it.`,
      roleKey: invite.roleKey,
      roleLabel,
      invitedEmail: invite.email,
      currentEmail: user.email ?? undefined,
    };
  }

  // ── Apply. Delegates to the shared helper so the token path and
  //    the sign-in provisioning path can never diverge. Idempotent:
  //    the helper no-ops when there is no pending invite. ──
  const result = await acceptPendingStaffInviteForUser({
    userId: user.id,
    email: user.email,
  });

  if (result.applied) {
    revalidatePath("/staff");
    revalidatePath("/dashboard");
    return {
      outcome: "accepted",
      message: `Your ${roleLabel} access is now active.`,
      roleKey: invite.roleKey,
      roleLabel,
      invitedEmail: invite.email,
    };
  }

  if (result.reason === "already_super_admin") {
    return {
      outcome: "already_super_admin",
      message:
        "You already have Super Admin access, which is broader than this invitation. Nothing was changed.",
      roleKey: invite.roleKey,
      roleLabel,
    };
  }

  if (result.reason === "no_invite") {
    // Raced with another acceptance (e.g. they signed in and the
    // provisioning path applied it a moment earlier).
    return {
      outcome: "already_accepted",
      message: `Your ${roleLabel} access is already active.`,
      roleKey: invite.roleKey,
      roleLabel,
    };
  }

  if (result.reason === "email_unverified") {
    return {
      outcome: "error",
      message: `Confirm your email address (${invite.email}) before accepting this invitation, then open the link again.`,
      roleKey: invite.roleKey,
      roleLabel,
    };
  }

  if (result.reason === "expired") {
    return {
      outcome: "expired",
      message:
        "This invitation has expired. Ask your administrator to send a new one.",
      roleKey: invite.roleKey,
      roleLabel,
    };
  }

  console.warn(`[invite-accept] unapplied: reason=${result.reason} ${result.error ?? ""}`);
  return {
    outcome: "error",
    message:
      "We could not activate your staff access. Please contact your administrator.",
    roleKey: invite.roleKey,
    roleLabel,
  };
}
