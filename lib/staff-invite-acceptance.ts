/**
 * Staff invite acceptance helper.
 *
 * Runs after a user is authenticated AND their public.users row exists.
 * If a pending staff invite matches their email, this:
 *
 *   1. Writes role_key + permissions + staff_status='active' on the
 *      user's `public.users` row (via the staff repository).
 *   2. Marks the invite as `accepted`.
 *
 * Phase 18: it deliberately does NOT touch `users.role`. Staff access
 * resolves from the staff grant alone, so an existing student who
 * accepts a Teacher invite keeps their student functionality. See the
 * inline note at the write site for the full rationale.
 *
 * Idempotent: a second call with no pending invite is a no-op.
 *
 * Protections:
 *   - Ignores expired invites (best-effort; pending status alone is
 *     enough since the repository only returns `status='pending'`,
 *     but we double-check `expires_at`).
 *   - Ignores revoked invites (filtered out by `getPendingInviteByEmail`).
 *   - Ignores invites for the wrong email (only fetched by lower(email)).
 *   - Never downgrades an existing `super_admin` — the invite is
 *     consumed (marked accepted) so it stops re-appearing in the
 *     pending list, but the user's role/permissions are left intact.
 *
 * Called from `lib/auth-provisioning.ts::ensureSupabaseProfile`, which
 * itself is invoked from the auth callback and the password sign-in
 * flow. That covers signup confirmation, magic link, OAuth, password
 * recovery, AND password sign-in — every code path through which a
 * Supabase user becomes "active" in the BPM admin shell.
 */

import "server-only";

import { getStaffRepo } from "@/lib/repositories";
import { isMemoryMode } from "@/lib/config/data-provider";
import type { StaffRoleKey } from "@/lib/domain/permissions";

function legacyRoleForStaffRole(roleKey: StaffRoleKey): "admin" | "teacher" {
  return roleKey === "teacher" ? "teacher" : "admin";
}

export type AcceptInviteReason =
  | "no_email"
  | "no_invite"
  | "expired"
  | "already_super_admin"
  | "applied"
  | "error";

export interface AcceptInviteResult {
  applied: boolean;
  reason: AcceptInviteReason;
  roleKey?: StaffRoleKey;
  error?: string;
}

export async function acceptPendingStaffInviteForUser(input: {
  userId: string;
  email: string | null | undefined;
}): Promise<AcceptInviteResult> {
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !input.userId) {
    return { applied: false, reason: "no_email" };
  }

  const repo = getStaffRepo();

  let invite;
  try {
    invite = await repo.getPendingInviteByEmail(email);
  } catch (err) {
    return {
      applied: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (!invite) return { applied: false, reason: "no_invite" };

  // Expiry guard. The repo filters by status='pending' so expired
  // invites *should* already have been swept, but pending+future-dated
  // expiry is the only safe combination — we re-check in case nothing
  // has moved them yet.
  if (invite.expiresAt) {
    const expiresMs = Date.parse(invite.expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return { applied: false, reason: "expired" };
    }
  }

  // Email mismatch guard. The repo lookup is by lower(email) so the
  // invite shouldn't even surface here, but if a future implementation
  // relaxes that we still refuse to apply across emails.
  if (invite.email.trim().toLowerCase() !== email) {
    return { applied: false, reason: "no_invite" };
  }

  let existing = null;
  try {
    existing = await repo.getStaff(input.userId);
  } catch {
    existing = null;
  }

  // Downgrade protection: never overwrite an existing Super Admin
  // with a lower-privileged invite. We still consume the invite so
  // it doesn't perpetually re-trigger on every sign-in.
  if (
    existing?.roleKey === "super_admin" &&
    invite.roleKey !== "super_admin"
  ) {
    try {
      await repo.markInviteAccepted(invite.id);
    } catch {
      // Non-fatal — protection still held.
    }
    return { applied: false, reason: "already_super_admin" };
  }

  try {
    if (existing) {
      // Common path: the user row already has a staff record (e.g. a
      // teacher seeded by migration backfill, or a re-invite of an
      // existing staff member at a new role).
      await repo.updateStaff(input.userId, {
        roleKey: invite.roleKey,
        permissions: invite.permissions,
        status: "active",
      });
    } else if (isMemoryMode()) {
      // Memory mode dev/test: synthesize a staff row from the invite.
      const { upsertStaffFromInvite } = await import(
        "@/lib/services/staff-store"
      );
      upsertStaffFromInvite(invite, {
        id: input.userId,
        fullName: invite.displayName ?? email,
        legacyRole: legacyRoleForStaffRole(invite.roleKey),
      });
    } else {
      // Supabase mode: the public.users row exists from
      // ensureSupabaseProfile, which runs immediately before this.
      // updateStaff() writes the staff_* columns directly onto it.
      await repo.updateStaff(input.userId, {
        roleKey: invite.roleKey,
        permissions: invite.permissions,
        status: "active",
      });
    }

    // Phase 18 — `users.role` is deliberately NOT modified.
    //
    // This used to flip it to 'teacher'/'admin' so the legacy routing
    // layer would treat the user as staff. That granted staff access
    // but silently destroyed student functionality: `users.role` owns
    // Catalog, student page guards and student-only navigation, so an
    // existing student who accepted a Teacher invite lost the ability
    // to browse and buy passes.
    //
    // Staff access now resolves from `staff_role_key` + `staff_status`
    // independently of the base role (see `getStaffAccess`), and
    // `listStaff` discovers staff via the grant rather than the role.
    // Nothing downstream needs the base role changed any more, so a
    // student who becomes a teacher keeps both identities.
    //
    // Consequence worth knowing: a brand-new person invited as staff
    // is provisioned with `users.role='student'` by
    // `ensureSupabaseProfile`, so they will also carry the student
    // base role. That is harmless — they simply also see Catalog —
    // and is preferable to the previous behaviour of mutating roles
    // behind the admin's back.

    await repo.markInviteAccepted(invite.id);
    return { applied: true, reason: "applied", roleKey: invite.roleKey };
  } catch (err) {
    return {
      applied: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
