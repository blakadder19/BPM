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
 *   - Permission ceiling: a non-super-admin cannot grant, or reactivate,
 *     permissions they do not hold, cannot change their own grant and
 *     cannot touch Super Admin accounts (`checkGrantChange`).
 *
 * INVITE FLOW (MVP, copy-link only)
 *   - Super admin creates an invite for an email + role + permissions.
 *     The action returns the invite URL so the inviter can share it
 *     manually (no email sending in this PR).
 *   - The invite is accepted either at `/invite/[token]`
 *     (`acceptStaffInviteByTokenAction`) or during sign-in provisioning
 *     (`ensureSupabaseProfile`). Both derive the user from verified auth
 *     and write the role_key + permissions onto their public.users row.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getStaffRepo } from "@/lib/repositories";
import {
  expandPermissions,
  isPermissionKey,
  normalizePermissionsForStorage,
  STAFF_ROLE_KEYS,
  type Permission,
  type StaffRoleKey,
  type StaffStatus,
} from "@/lib/domain/permissions";
import {
  requirePermissionForAction,
  getStaffAccess,
  type StaffAccess,
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

/**
 * Rules for every path that writes a staff grant (invite of an existing
 * account, permission edits, invites of new emails). Returns an error
 * message, or null when the change is allowed.
 *
 * A non-super-admin can never touch Super Admin access, never change their
 * own grant, and never grant a permission they do not hold themselves.
 */
async function checkGrantChange(
  actor: StaffAccess,
  target: { id: string | null; roleKey: StaffRoleKey | null },
  next: { roleKey: StaffRoleKey; permissions: Permission[] },
): Promise<string | null> {
  const targetIsSuper = target.roleKey === "super_admin";
  const isSelf = target.id !== null && target.id === actor.user.id;

  if ((next.roleKey === "super_admin" || targetIsSuper) && !actor.isSuperAdmin) {
    return "Only a Super Admin can manage Super Admin access.";
  }

  if (!actor.isSuperAdmin) {
    if (isSelf) {
      return "You cannot change your own staff access. Ask a Super Admin.";
    }
    for (const p of expandPermissions(next.roleKey, next.permissions)) {
      if (!actor.permissions.has(p)) {
        return "You cannot grant permissions you do not hold yourself.";
      }
    }
  }

  if (isSelf && targetIsSuper && next.roleKey !== "super_admin") {
    return "You cannot remove your own Super Admin role. Ask another Super Admin to do it.";
  }

  if (targetIsSuper && next.roleKey !== "super_admin") {
    const remaining = await countActiveSuperAdmins();
    if (remaining <= 1) {
      return "This is the last active Super Admin — promote someone else first.";
    }
  }

  return null;
}

// ── Invite ─────────────────────────────────────────────────────

export interface InviteStaffInput {
  email: string;
  displayName?: string | null;
  roleKey: StaffRoleKey;
  permissions: Permission[];
  /**
   * Phase 18 — explicitly add this person to the teaching roster.
   * Only applied for `roleKey: "teacher"`. Staff access and roster
   * membership are separate concepts, so this is opt-in.
   */
  addToTeacherRoster?: boolean;
}

export interface InviteStaffInputExtras {
  /**
   * Phase 18 — explicitly add this person to the teaching roster.
   * Only meaningful for `roleKey: "teacher"`. Staff access and roster
   * membership are separate concepts (see the roster note in the
   * report), so this is opt-in rather than implied.
   */
  addToTeacherRoster?: boolean;
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
   *   - undefined — immediate-grant path (no email attempt).
   */
  emailStatus?: "sent" | "skipped" | "failed";
  emailReason?: string;
  /**
   * Phase 18 — which of the two semantics actually happened, so the
   * UI can say the right thing instead of always reporting "invited".
   *
   *   "granted" — the email already had a BPM account, so staff
   *               access was applied immediately. No invite row, no
   *               email; there is nothing for them to accept.
   *   "invited" — no account yet. A pending invite was created and
   *               emailed; access begins when they accept.
   */
  outcome: "granted" | "invited";
  /** Set on the "granted" path when the person keeps a student base role. */
  keepsStudentAccess?: boolean;
  /** Phase 18 — whether a teacher-roster entry was created/linked. */
  rosterLinked?: boolean;
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
  const storedPermissions = normalizePermissionsForStorage(
    input.roleKey,
    permissions,
  );
  console.info(
    `[staff] invite: email=${email} role=${input.roleKey} extras=${storedPermissions.length}`,
  );

  const repo = getStaffRepo();

  // ── Decision: existing account → IMMEDIATE GRANT ──────────
  //
  // `getStaffByEmail` matches ANY `public.users` row, including a
  // plain student. That is intentional here: if the person already
  // has a BPM account there is nothing to "invite" them to — they can
  // already sign in — so we activate the grant in place.
  //
  // Requiring an email round-trip for someone who already has an
  // account would add a failure mode (they click the link while
  // logged in, nothing happens) for no security benefit: the admin
  // performing this action already holds `staff:invite`.
  //
  // What changed in Phase 18:
  //   * `users.role` is explicitly PRESERVED, so an existing student
  //     keeps Catalog, bookings and entitlements while gaining staff
  //     permissions. Previously this path left a half-state where the
  //     staff columns were set but `getStaffAccess` ignored them.
  //   * The result reports `outcome: "granted"` so the UI can say
  //     "access granted" rather than claiming an invite was sent when
  //     no email was ever dispatched.
  const existing = await repo.getStaffByEmail(email);
  const grantError = await checkGrantChange(
    guard.access,
    { id: existing?.id ?? null, roleKey: existing?.roleKey ?? null },
    { roleKey: input.roleKey, permissions: storedPermissions },
  );
  if (grantError) return { success: false, error: grantError };

  if (existing) {
    await repo.updateStaff(existing.id, {
      roleKey: input.roleKey,
      permissions: storedPermissions,
      status: "active",
    });

    // Base role is untouched on purpose — see the note above.
    const keepsStudentAccess = existing.legacyRole === "student";

    const rosterLinked = await maybeLinkTeacherRoster({
      userId: existing.id,
      roleKey: input.roleKey,
      requested: !!input.addToTeacherRoster,
      fullName: existing.fullName ?? input.displayName ?? email,
      email,
    });

    console.info(
      `[staff] grant: email=${email} role=${input.roleKey} immediate=true keepsStudent=${keepsStudentAccess} roster=${rosterLinked}`,
    );

    revalidatePath("/staff");
    revalidatePath("/classes");
    return {
      success: true,
      data: {
        inviteId: "",
        inviteUrl: "",
        email,
        outcome: "granted",
        keepsStudentAccess,
        rosterLinked,
      },
    };
  }

  const invite = await repo.createInvite({
    email,
    displayName: input.displayName ?? null,
    roleKey: input.roleKey,
    permissions: storedPermissions,
    invitedBy: guard.access.user.id,
  });

  // Build the copy-link. The recipient signs in with this email through
  // the normal Supabase auth flow and accepts at `/invite/[token]`.
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
  // Phase 18 — points at the real acceptance route. This used to be
  // `/login?invite=<token>`, where the token was never read: an
  // already-signed-in recipient was bounced to /dashboard and their
  // invite silently stayed pending.
  const inviteUrl = `${base}/invite/${encodeURIComponent(invite.token)}`;

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
      outcome: "invited",
    },
  };
}

// ── Teacher roster linkage (Phase 18) ───────────────────────

/**
 * Optionally create/link a `teacher_roster` entry for a new staff
 * member.
 *
 * Staff access and roster membership are DELIBERATELY separate
 * concepts in BPM:
 *
 *   staff grant   → what the person can DO in the app (permissions).
 *   teacher_roster → who can be ASSIGNED to teach a class slot.
 *
 * They are not interchangeable. The roster legitimately contains
 * people with no BPM login at all (guest instructors, visiting
 * teachers), and a Teacher-role staff member is not automatically
 * someone you want appearing in every scheduling dropdown.
 *
 * So this is opt-in via an explicit admin checkbox rather than
 * implied. When requested, the link is written on `user_id` — never
 * matched by display name, which would be ambiguous (the seed roster
 * already contains a bare "Guillermo" with no email).
 *
 * Returns true when a roster row was created or linked.
 */
async function maybeLinkTeacherRoster(input: {
  userId: string;
  roleKey: StaffRoleKey;
  requested: boolean;
  fullName: string;
  email: string;
}): Promise<boolean> {
  if (!input.requested) return false;
  // Only meaningful for teaching roles.
  if (input.roleKey !== "teacher") return false;

  try {
    const { linkTeacherRosterToUser } = await import(
      "@/lib/services/teacher-roster-store"
    );
    return await linkTeacherRosterToUser({
      userId: input.userId,
      fullName: input.fullName,
      email: input.email,
    });
  } catch (e) {
    // Non-fatal: the staff grant itself already succeeded, and the
    // admin can add the roster entry manually from the Classes page.
    console.warn(
      `[staff] teacher-roster link failed for ${input.email}:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
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

  const permissions = sanitizePermissions(input.permissions);
  const storedPermissions = normalizePermissionsForStorage(
    input.roleKey,
    permissions,
  );

  const grantError = await checkGrantChange(
    guard.access,
    { id: target.id, roleKey: target.roleKey },
    { roleKey: input.roleKey, permissions: storedPermissions },
  );
  if (grantError) return { success: false, error: grantError };
  console.info(
    `[staff] update: user=${input.userId} role=${input.roleKey} extras=${storedPermissions.length}`,
  );

  await getStaffRepo().updateStaff(input.userId, {
    roleKey: input.roleKey,
    permissions: storedPermissions,
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
  if (target.roleKey === "super_admin" && !guard.access.isSuperAdmin) {
    return {
      success: false,
      error: "Only a Super Admin can edit a Super Admin's profile.",
    };
  }

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

  if (target.roleKey === "super_admin" && !guard.access.isSuperAdmin) {
    return {
      success: false,
      error: "Only a Super Admin can change a Super Admin's access.",
    };
  }

  // Activating makes the stored grant live, so it is subject to the same
  // ceiling as granting it directly.
  if (input.status === "active" && target.roleKey) {
    const grantError = await checkGrantChange(
      guard.access,
      { id: target.id, roleKey: target.roleKey },
      { roleKey: target.roleKey, permissions: target.permissions },
    );
    if (grantError) return { success: false, error: grantError };
  }

  if (target.roleKey === "super_admin" && input.status === "disabled") {
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
