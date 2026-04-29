"use server";

/**
 * Staff & Permissions server actions.
 *
 * SECURITY POSTURE
 *   - Every action verifies the actor's permission server-side via
 *     `requirePermissionForAction`. Hiding UI buttons is NOT enough.
 *   - Last-super-admin protection: cannot disable, downgrade, or
 *     remove permissions from the only remaining active super admin.
 *   - Self-protection: cannot remove your own super-admin role.
 *
 * INVITE FLOW (MVP, copy-link only)
 *   - Super admin creates an invite for an email + role + permissions.
 *     The action returns the invite URL so the inviter can share it
 *     manually (no email sending in this PR).
 *   - When a Supabase user signs in matching that email, the invite is
 *     accepted by `acceptStaffInviteOnSignInAction` (called from the
 *     auth callback), which writes the role_key + permissions onto
 *     their public.users row.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getStaffRepo } from "@/lib/repositories";
import {
  isPermissionKey,
  ROLE_PRESETS,
  STAFF_ROLE_KEYS,
  type Permission,
  type StaffRoleKey,
  type StaffStatus,
} from "@/lib/domain/permissions";
import {
  requirePermissionForAction,
  getStaffAccess,
} from "@/lib/staff-permissions";

interface ActionOk<T = void> {
  success: true;
  data?: T;
}
interface ActionErr {
  success: false;
  error: string;
}
type ActionResult<T = void> = ActionOk<T> | ActionErr;

function normalizeEmail(input: string): string {
  return (input ?? "").trim().toLowerCase();
}

/**
 * Resolve the absolute origin to use when constructing copy-link
 * invite URLs. Falls back through environment hints and the request
 * host so a missing NEXT_PUBLIC_SITE_URL on a Vercel preview never
 * leaves the admin with a relative `/login?invite=...` link they
 * cannot share.
 */
async function resolveBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;

  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (host.includes("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() can throw outside a request context; fall through.
  }

  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  const out: Permission[] = [];
  for (const v of input) {
    if (typeof v === "string" && isPermissionKey(v)) out.push(v);
  }
  return out;
}

function isValidRoleKey(value: unknown): value is StaffRoleKey {
  return (
    typeof value === "string" &&
    (STAFF_ROLE_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Count remaining active super admins. Used by every code path that
 * could possibly demote or disable the last one.
 */
async function countActiveSuperAdmins(): Promise<number> {
  const all = await getStaffRepo().listStaff();
  return all.filter(
    (s) => s.roleKey === "super_admin" && s.status === "active",
  ).length;
}

// ── Invite ─────────────────────────────────────────────────────

export interface InviteStaffInput {
  email: string;
  displayName?: string | null;
  roleKey: StaffRoleKey;
  permissions: Permission[];
}

export interface InviteStaffResult {
  inviteId: string;
  inviteUrl: string;
  email: string;
  /**
   * Whether the invite email was actually sent.
   *   - "sent"    — Brevo accepted the message.
   *   - "skipped" — BREVO_API_KEY not configured; copy-link only.
   *   - "failed"  — Brevo rejected; copy-link still valid.
   *   - undefined — existing-staff-update path (no email attempt).
   */
  emailStatus?: "sent" | "skipped" | "failed";
  emailReason?: string;
}

export async function inviteStaffAction(
  input: InviteStaffInput,
): Promise<ActionResult<InviteStaffResult>> {
  const guard = await requirePermissionForAction("staff:invite");
  if (!guard.ok) return { success: false, error: guard.error };

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { success: false, error: "Enter a valid email address." };
  }
  if (!isValidRoleKey(input.roleKey)) {
    return { success: false, error: "Invalid role." };
  }

  // Only super admins can mint other super admins.
  if (input.roleKey === "super_admin" && !guard.access.isSuperAdmin) {
    return {
      success: false,
      error: "Only a Super Admin can invite another Super Admin.",
    };
  }

  const permissions = sanitizePermissions(input.permissions);

  const repo = getStaffRepo();
  // If the email already belongs to a staff member, prefer in-place
  // update over creating a redundant invite.
  const existing = await repo.getStaffByEmail(email);
  if (existing) {
    await repo.updateStaff(existing.id, {
      roleKey: input.roleKey,
      permissions:
        input.roleKey === "super_admin"
          ? []
          : input.roleKey === "custom"
            ? permissions
            : [...ROLE_PRESETS[input.roleKey], ...permissions]
                // Dedup
                .filter((v, i, arr) => arr.indexOf(v) === i),
      status: "active",
    });
    revalidatePath("/staff");
    return {
      success: true,
      data: { inviteId: "", inviteUrl: "", email },
    };
  }

  const invite = await repo.createInvite({
    email,
    displayName: input.displayName ?? null,
    roleKey: input.roleKey,
    permissions:
      input.roleKey === "super_admin"
        ? []
        : input.roleKey === "custom"
          ? permissions
          : [...ROLE_PRESETS[input.roleKey], ...permissions].filter(
              (v, i, arr) => arr.indexOf(v) === i,
            ),
    invitedBy: guard.access.user.id,
  });

  // Build the copy-link. The recipient signs in with this email through
  // the normal Supabase auth flow; the auth callback will see the
  // pending invite and call `acceptStaffInviteOnSignInAction`.
  //
  // Resolution order for the absolute base URL:
  //   1. NEXT_PUBLIC_SITE_URL (explicit prod/preview override)
  //   2. The current request's Host header (covers Vercel previews
  //      where SITE_URL isn't configured per environment)
  //   3. VERCEL_URL (auto-injected by Vercel; lacks scheme)
  //   4. localhost fallback for `next dev`
  // The point is to never return a relative link here, because the
  // invite link is meant to be shared cross-device and copied.
  const base = await resolveBaseUrl();
  const inviteUrl = `${base}/login?invite=${encodeURIComponent(invite.token)}`;

  // Send the invite email through Brevo. Never fails the action — if
  // Brevo is not configured or rejects, the copy-link remains valid
  // and the UI surfaces a clear "could not send" notice.
  const { sendStaffInviteEmail } = await import(
    "@/lib/communications/staff-invite-email"
  );
  const emailResult = await sendStaffInviteEmail({
    email,
    displayName: input.displayName ?? null,
    roleKey: input.roleKey,
    inviteUrl,
    expiresAt: invite.expiresAt,
    invitedByName:
      guard.access.user.fullName ?? guard.access.user.email ?? null,
  });

  revalidatePath("/staff");
  return {
    success: true,
    data: {
      inviteId: invite.id,
      inviteUrl,
      email,
      emailStatus: emailResult.status,
      emailReason: emailResult.reason,
    },
  };
}

// ── Update permissions / role ──────────────────────────────────

export interface UpdateStaffPermissionsInput {
  userId: string;
  roleKey: StaffRoleKey;
  permissions: Permission[];
}

export async function updateStaffPermissionsAction(
  input: UpdateStaffPermissionsInput,
): Promise<ActionResult> {
  const guard = await requirePermissionForAction("staff:edit_permissions");
  if (!guard.ok) return { success: false, error: guard.error };

  const target = await getStaffRepo().getStaff(input.userId);
  if (!target) return { success: false, error: "Staff member not found." };

  if (!isValidRoleKey(input.roleKey)) {
    return { success: false, error: "Invalid role." };
  }

  // Only super admins can promote to super_admin or demote a super admin.
  const targetIsSuper = target.roleKey === "super_admin";
  if (
    (input.roleKey === "super_admin" || targetIsSuper) &&
    !guard.access.isSuperAdmin
  ) {
    return {
      success: false,
      error: "Only a Super Admin can manage Super Admin access.",
    };
  }

  // Self-protection: cannot remove your own super_admin role.
  if (
    target.id === guard.access.user.id &&
    targetIsSuper &&
    input.roleKey !== "super_admin"
  ) {
    return {
      success: false,
      error:
        "You cannot remove your own Super Admin role. Ask another Super Admin to do it.",
    };
  }

  // Last-super-admin protection.
  if (targetIsSuper && input.roleKey !== "super_admin") {
    const remaining = await countActiveSuperAdmins();
    if (remaining <= 1) {
      return {
        success: false,
        error:
          "This is the last active Super Admin — promote someone else first.",
      };
    }
  }

  const permissions = sanitizePermissions(input.permissions);
  await getStaffRepo().updateStaff(input.userId, {
    roleKey: input.roleKey,
    permissions:
      input.roleKey === "super_admin"
        ? []
        : input.roleKey === "custom"
          ? permissions
          : [...ROLE_PRESETS[input.roleKey], ...permissions].filter(
              (v, i, arr) => arr.indexOf(v) === i,
            ),
  });

  revalidatePath("/staff");
  return { success: true };
}

// ── Display name (profile) ─────────────────────────────────────

export interface UpdateStaffProfileInput {
  userId: string;
  fullName: string;
}

/**
 * Edit a staff member's display name. Email is intentionally NOT
 * editable here — that flows through Supabase Auth, not the staff
 * module. Reuses the `staff:edit_permissions` permission so anyone
 * who can change role/permissions can also fix typos in names; this
 * keeps the permission catalogue small for the MVP.
 */
export async function updateStaffProfileAction(
  input: UpdateStaffProfileInput,
): Promise<ActionResult> {
  const guard = await requirePermissionForAction("staff:edit_permissions");
  if (!guard.ok) return { success: false, error: guard.error };

  const fullName = (input.fullName ?? "").trim();
  if (!fullName) {
    return { success: false, error: "Display name cannot be empty." };
  }
  if (fullName.length > 120) {
    return { success: false, error: "Display name is too long." };
  }

  const target = await getStaffRepo().getStaff(input.userId);
  if (!target) return { success: false, error: "Staff member not found." };

  await getStaffRepo().updateStaff(input.userId, { fullName });

  // The display name is shown in the sidebar/topbar for the current
  // user, in the finance BY column for any staff actor, and in the
  // staff list. Revalidate the staff page; topbar/sidebar refresh on
  // the next navigation.
  revalidatePath("/staff");
  return { success: true };
}

// ── Status (active / disabled) ─────────────────────────────────

export async function setStaffStatusAction(input: {
  userId: string;
  status: StaffStatus;
}): Promise<ActionResult> {
  const guard = await requirePermissionForAction("staff:disable");
  if (!guard.ok) return { success: false, error: guard.error };

  const target = await getStaffRepo().getStaff(input.userId);
  if (!target) return { success: false, error: "Staff member not found." };

  if (input.status !== "active" && input.status !== "disabled") {
    return { success: false, error: "Invalid status." };
  }

  if (target.id === guard.access.user.id && input.status === "disabled") {
    return { success: false, error: "You cannot disable your own access." };
  }

  if (target.roleKey === "super_admin" && input.status === "disabled") {
    if (!guard.access.isSuperAdmin) {
      return {
        success: false,
        error: "Only a Super Admin can disable a Super Admin.",
      };
    }
    const remaining = await countActiveSuperAdmins();
    if (remaining <= 1) {
      return {
        success: false,
        error: "This is the last active Super Admin — cannot disable.",
      };
    }
  }

  await getStaffRepo().updateStaff(input.userId, { status: input.status });
  revalidatePath("/staff");
  return { success: true };
}

// ── Invite revoke ──────────────────────────────────────────────

export async function revokeStaffInviteAction(input: {
  inviteId: string;
}): Promise<ActionResult> {
  const guard = await requirePermissionForAction("staff:revoke_invite");
  if (!guard.ok) return { success: false, error: guard.error };

  const ok = await getStaffRepo().revokeInvite(input.inviteId);
  if (!ok) return { success: false, error: "Invite not found or not pending." };
  revalidatePath("/staff");
  return { success: true };
}

// ── Accept on sign-in ──────────────────────────────────────────

/**
 * Server-action wrapper around the shared staff-invite acceptance
 * helper. The actual acceptance now happens inside
 * `ensureSupabaseProfile` (provisioning), so this action is mostly a
 * thin compatibility shim — kept exported in case any client surface
 * still calls it directly.
 *
 * Idempotent — safe to call on every sign-in.
 */
export async function acceptStaffInviteOnSignInAction(input: {
  userId: string;
  email: string;
}): Promise<ActionResult> {
  const { acceptPendingStaffInviteForUser } = await import(
    "@/lib/staff-invite-acceptance"
  );
  const result = await acceptPendingStaffInviteForUser({
    userId: input.userId,
    email: input.email,
  });
  if (result.reason === "error") {
    return { success: false, error: result.error ?? "Failed to apply invite." };
  }
  return { success: true };
}

// Re-exported helper so admin pages can render an "are you a legacy
// admin?" banner without instantiating staff-permissions in client code.
export async function loadCurrentStaffAccessForBannerAction() {
  const access = await getStaffAccess();
  return {
    isSuperAdmin: access.isSuperAdmin,
    isLegacyAdminFallback: access.isLegacyAdminFallback,
    roleKey: access.roleKey,
  };
}
