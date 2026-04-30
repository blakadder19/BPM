import "server-only";

/**
 * Staff invite email sender.
 *
 * Why this is separate from `dispatchCommEvents`:
 *   The standard comm event pipeline is keyed on a `studentId` and
 *   writes to `student_notifications` for the in-app channel. Staff
 *   invites go to people who frequently DON'T have a student row yet
 *   (and may never have one). So we bypass the in-app channel and
 *   send a single transactional email directly via the existing
 *   Brevo provider.
 *
 * Idempotency:
 *   The token is unique per invite. Re-inviting the same email
 *   revokes the prior pending invite and mints a fresh token (see
 *   supabase staff repo `createInvite`). So the email naturally
 *   carries a fresh URL each time and there is no "double send" risk
 *   tied to a stable key. The action layer also runs server-side
 *   only — page refresh does not retrigger sending.
 *
 * Failure semantics:
 *   - Returns `{ status: 'sent' }` when Brevo accepts the message.
 *   - Returns `{ status: 'skipped', reason: 'no_brevo_key' }` when
 *     `BREVO_API_KEY` is not configured. The invite is still valid;
 *     admin just needs to share the link manually.
 *   - Returns `{ status: 'failed', reason }` when Brevo rejects. The
 *     invite is still valid; admin can still copy the link.
 *
 * NEVER throws — invite creation must not roll back because email failed.
 */

import { isEmailEnabled, sendEmail } from "./email-provider";
import {
  bpmEmailWrap,
  bpmCtaButton,
  bpmDetailsCard,
  bpmNotice,
  B,
} from "./email-brand";
import { getAppUrl } from "@/lib/utils/app-url";
import {
  STAFF_ROLE_LABELS,
  type StaffRoleKey,
} from "@/lib/domain/permissions";

export type StaffInviteEmailStatus = "sent" | "skipped" | "failed";

export interface SendStaffInviteEmailInput {
  email: string;
  displayName: string | null;
  roleKey: StaffRoleKey;
  inviteUrl: string;
  expiresAt: string | null;
  invitedByName: string | null;
}

export interface SendStaffInviteEmailResult {
  status: StaffInviteEmailStatus;
  reason?: string;
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-IE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function buildSubject(roleKey: StaffRoleKey): string {
  return `You're invited to join BPM as ${STAFF_ROLE_LABELS[roleKey]}`;
}

function buildHtml(input: SendStaffInviteEmailInput): string {
  const recipientName = input.displayName?.trim() || "there";
  const roleLabel = STAFF_ROLE_LABELS[input.roleKey];
  const expiryLabel = formatExpiry(input.expiresAt);
  const inviter = input.invitedByName?.trim() || "BPM";

  const detailRows = [
    {
      label: "Role",
      valueHtml: `<strong>${roleLabel}</strong>`,
    },
    {
      label: "Email",
      valueHtml: `<span style="font-family:monospace;color:${B.ZINC_700};">${input.email}</span>`,
    },
  ];
  if (expiryLabel) {
    detailRows.push({
      label: "Expires",
      valueHtml: expiryLabel,
    });
  }

  const intro = `<p style="margin:0 0 16px;color:${B.ZINC_700};font-size:14px;line-height:1.6;">
    ${escapeHtml(inviter)} has invited you to join the BPM admin team as
    <strong>${roleLabel}</strong>. Accept this invitation to activate your
    staff access. You will be able to sign in (or sign up if you don't have
    a BPM account yet) using the email this message was sent to.
  </p>`;

  const detailsCard = bpmDetailsCard(detailRows, "Invitation");

  const cta = bpmCtaButton(input.inviteUrl, "Accept invitation");

  const fallbackUrl = `<p style="margin:16px 0 8px;color:${B.ZINC_500};font-size:12px;line-height:1.5;">
    If the button doesn't work, copy and paste this link into your browser:
  </p>
  <p style="margin:0 0 24px;word-break:break-all;font-family:monospace;font-size:12px;color:${B.ZINC_700};">
    ${input.inviteUrl}
  </p>`;

  const note = bpmNotice(
    "info",
    `If you didn't expect this invitation you can ignore this email — the invite link will simply expire.`,
  );

  return bpmEmailWrap({
    appUrl: getAppUrl(),
    recipientName: escapeHtml(recipientName),
    heading: `Join BPM as ${roleLabel}`,
    bodyHtml: [intro, detailsCard, cta, fallbackUrl, note].join("\n"),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendStaffInviteEmail(
  input: SendStaffInviteEmailInput,
): Promise<SendStaffInviteEmailResult> {
  if (!isEmailEnabled()) {
    console.info(
      `[staff-invite-email] BREVO_API_KEY not configured — skipping send to ${input.email}. The invite link is still valid; admin must share it manually.`,
    );
    return { status: "skipped", reason: "no_brevo_key" };
  }

  try {
    const subject = buildSubject(input.roleKey);
    const html = buildHtml(input);
    const ok = await sendEmail({ to: input.email, subject, html });
    if (ok) {
      console.info(
        `[staff-invite-email] Brevo accepted invite email for ${input.email} role=${input.roleKey}.`,
      );
      return { status: "sent" };
    }
    console.warn(
      `[staff-invite-email] Brevo did not accept invite email for ${input.email}. Admin can still share the copy-link.`,
    );
    return { status: "failed", reason: "brevo_rejected" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[staff-invite-email] send threw for ${input.email}: ${msg}`);
    return { status: "failed", reason: msg };
  }
}
