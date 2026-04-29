/**
 * Staff invite acceptance helper.
 *
 * Runs after a user is authenticated AND their public.users row exists.
 * If a pending staff invite matches their email, this:
 *
 *   1. Writes role_key + permissions + staff_status='active' on the
 *      user's `public.users` row (via the staff repository).
 *   2. Updates `users.role` to match the invite's legacy role bucket
 *      (teacher → 'teacher', everything else → 'admin') so the
 *      admin/teacher routing layer treats them as staff and the
 *      /staff list includes them.
 *   3. Marks the invite as `accepted`.
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
import { isMemoryMode, isSupabaseMode } from "@/lib/config/data-provider";
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

    // Flip `users.role` so the legacy admin/teacher routing layer
    // (which gates the protected app shell, navigation filtering for
    // students, and the staff list query) treats this user as staff.
    if (isSupabaseMode()) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();
        const desiredRole = legacyRoleForStaffRole(invite.roleKey);
        await admin
          .from("users")
          .update({ role: desiredRole } as never)
          .eq("id", input.userId);
      } catch {
        // Non-fatal — staff_role_key drives permission enforcement.
        // The /staff list filter is the only thing that depends on
        // users.role for this code path.
      }
    }

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
