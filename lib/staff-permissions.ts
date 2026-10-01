import { cache } from "react";
import { redirect } from "next/navigation";
import { requireAuth, type AuthUser } from "@/lib/auth";
import { getStaffRepo } from "@/lib/repositories";
import {
  expandPermissions,
  STAFF_ROLE_LABELS,
  type Permission,
  type StaffRoleKey,
  type StaffStatus,
} from "@/lib/domain/permissions";

/**
 * Resolved access for the current user.
 *
 * ── Dual-role model (Phase 18) ─────────────────────────────
 *
 * BPM separates two orthogonal identities:
 *
 *   `users.role`        — the BASE account role. Owns student-facing
 *                         functionality: Catalog, bookings as a
 *                         customer, passes, credits, entitlements.
 *   `staff_role_key` +  — the STAFF ACCESS layer. Owns admin/teacher
 *   `staff_status`        tooling and is the sole source of
 *   `staff_permissions`   permissions.
 *
 * A person can hold both at once. A dance teacher who also takes
 * classes is the normal case at BPM, not an edge case: they book and
 * pay as a student AND run check-in as a teacher.
 *
 * Before Phase 18 this resolver early-returned an empty permission
 * set whenever `users.role === 'student'`, so `staff_role_key` was
 * never even read for such a user. The workaround had been to flip
 * `users.role` to 'teacher', which granted staff access but silently
 * removed their student functionality. That trade-off is now gone.
 *
 * `permissions` is the EXACT stored grant for an active staff member.
 * For super_admin it contains every key.
 */
export interface StaffAccess {
  user: AuthUser;
  roleKey: StaffRoleKey | null;
  status: StaffStatus;
  permissions: Set<Permission>;
  isSuperAdmin: boolean;
  /**
   * True when this access record exists ONLY because the user has
   * `users.role='admin'` and no staff_role_key has been assigned yet
   * (legacy backfill path). The Staff & Permissions page surfaces this
   * to nudge admins to formally assign role keys.
   */
  isLegacyAdminFallback: boolean;
  /**
   * Phase 18 — the user holds the student base role, so student-only
   * surfaces (Catalog, student entitlements) stay available to them
   * even when they also carry staff permissions.
   */
  isStudent: boolean;
  /**
   * Phase 18 — the user has an ACTIVE staff grant and therefore a
   * non-empty permission set. False for plain students and for staff
   * whose grant has been disabled.
   *
   * Never infer staff access from `roleKey` alone: a disabled grant
   * keeps its roleKey (so the Staff page can show "Teacher · Disabled")
   * but must convey no permissions.
   */
  isStaff: boolean;
}

/**
 * Resolve access for the current request, deduplicated via React.cache
 * so multiple page/action calls share one DB read.
 *
 * Resolution order:
 *   1. Load the user's row. An ACTIVE `staff_role_key` is the
 *      authoritative staff grant, evaluated regardless of base role —
 *      this is what makes student + teacher work.
 *   2. A DISABLED grant yields no permissions, but the roleKey is
 *      still reported so admin UI can label it.
 *   3. No staff grant and staff_status 'disabled' or 'pending' → no
 *      permissions, whatever `users.role` says.
 *   4. No staff grant, status active (or no row) → legacy bootstrap
 *      fallback for `users.role='admin'` only (→ super_admin), so a
 *      fresh install without migration 00059 is not locked out.
 *   5. Otherwise (including base-role teachers with no grant) → no
 *      staff permissions.
 *
 * Active grants use the EXACT stored permission list (`expandPermissions`);
 * role presets are never added back at runtime.
 *
 * In every branch `isStudent` is derived independently from
 * `users.role`, so student functionality is never a casualty of the
 * staff resolution.
 */
export const getStaffAccess = cache(async (): Promise<StaffAccess> => {
  const user = await requireAuth();
  const isStudent = user.role === "student";

  let row = null;
  try {
    row = await getStaffRepo().getStaff(user.id);
  } catch {
    // Repo may not be reachable in some unit-test contexts — fall
    // through to the legacy fallbacks below.
  }

  if (row && row.roleKey !== null) {
    // Disabled grant: keep the roleKey for labelling, grant nothing.
    if (row.status === "disabled") {
      return {
        user,
        roleKey: row.roleKey,
        status: "disabled",
        permissions: new Set(),
        isSuperAdmin: false,
        isLegacyAdminFallback: false,
        isStudent,
        isStaff: false,
      };
    }

    // `pending` is also not an active grant. It exists so an admin can
    // stage a role before the person accepts; treating it as live
    // would hand out permissions nobody confirmed.
    if (row.status !== "active") {
      return {
        user,
        roleKey: row.roleKey,
        status: row.status,
        permissions: new Set(),
        isSuperAdmin: false,
        isLegacyAdminFallback: false,
        isStudent,
        isStaff: false,
      };
    }

    const isSuper = row.roleKey === "super_admin";
    return {
      user,
      roleKey: row.roleKey,
      status: row.status,
      permissions: expandPermissions(row.roleKey, row.permissions),
      isSuperAdmin: isSuper,
      isLegacyAdminFallback: false,
      isStudent,
      isStaff: true,
    };
  }

  // No staff grant on the row (roleKey === null, or no row at all).
  //
  // A row in `public.users` exists for every authenticated user, so
  // roleKey===null must fall through to the legacy fallbacks — a
  // pre-migration `users.role='admin'` user would otherwise be locked
  // out with permissions=[].
  //
  // Except when staff_status says otherwise: a disabled or pending
  // account never regains staff access through the legacy role.
  if (row && row.status !== "active") {
    return {
      user,
      roleKey: null,
      status: row.status,
      permissions: new Set(),
      isSuperAdmin: false,
      isLegacyAdminFallback: false,
      isStudent,
      isStaff: false,
    };
  }

  // Legacy fallback: pre-existing role=admin without a staff_role_key.
  if (user.role === "admin") {
    return {
      user,
      roleKey: "super_admin",
      status: "active",
      permissions: expandPermissions("super_admin", null),
      isSuperAdmin: true,
      isLegacyAdminFallback: true,
      isStudent: false,
      isStaff: true,
    };
  }

  // A base-role teacher with no staff grant gets nothing: staff
  // permissions come only from an explicit, exact grant. Migration 00080
  // gave every active legacy teacher an explicit Teacher grant.

  // Plain student, or a base role with no staff grant at all.
  return {
    user,
    roleKey: null,
    status: "active",
    permissions: new Set(),
    isSuperAdmin: false,
    isLegacyAdminFallback: false,
    isStudent,
    isStaff: false,
  };
});

// ── Display label ────────────────────────────────────────────

/**
 * Human label for the resolved identity, shown in the topbar badge
 * and sidebar user card.
 *
 * Reads the RESOLVED access rather than `users.role`, which is what
 * made a dual-role teacher previously read as a plain "Student".
 *
 *   plain student            → "Student"
 *   student + teacher grant  → "Student · Teacher"
 *   pure teacher / admin     → "Teacher" / "Admin"
 *   super admin              → "Super Admin"
 *   disabled grant           → base label only (no permissions to advertise)
 */
export function resolveRoleLabel(access: {
  isStudent: boolean;
  isStaff: boolean;
  roleKey: StaffRoleKey | null;
  user: { role: string };
}): string {
  const BASE: Record<string, string> = {
    admin: "Admin",
    teacher: "Teacher",
    student: "Student",
  };
  const staffLabel =
    access.isStaff && access.roleKey ? STAFF_ROLE_LABELS[access.roleKey] : null;

  if (!staffLabel) return BASE[access.user.role] ?? access.user.role;
  // Dual role: surface both, student first since it is the base
  // account identity and explains why Catalog is present.
  if (access.isStudent) return `Student · ${staffLabel}`;
  return staffLabel;
}

export function hasPermission(access: StaffAccess, key: Permission): boolean {
  if (access.isSuperAdmin) return true;
  return access.permissions.has(key);
}

export function hasAnyPermission(
  access: StaffAccess,
  keys: readonly Permission[],
): boolean {
  if (access.isSuperAdmin) return true;
  for (const k of keys) if (access.permissions.has(k)) return true;
  return false;
}

/**
 * Server-side guard for pages — redirects to /dashboard if the user
 * lacks the requested permission. Mirrors `requireRole` semantics so
 * existing call sites can swap in cleanly.
 *
 * Use in page components:
 *   const access = await requirePermission("products:view");
 */
export async function requirePermission(key: Permission): Promise<StaffAccess> {
  const access = await getStaffAccess();
  if (hasPermission(access, key)) return access;
  redirect("/dashboard");
}

export async function requireAnyPermission(
  keys: readonly Permission[],
): Promise<StaffAccess> {
  const access = await getStaffAccess();
  if (hasAnyPermission(access, keys)) return access;
  redirect("/dashboard");
}

/**
 * Server-action variant — returns a structured error instead of
 * redirecting, so action callers can surface a clean message in the UI.
 *
 * Use in server actions:
 *   const guard = await requirePermissionForAction("payments:mark_paid_reception");
 *   if (!guard.ok) return { success: false, error: guard.error };
 *   const { access } = guard;
 */
export type ActionGuardResult =
  | { ok: true; access: StaffAccess }
  | { ok: false; error: string };

export async function requirePermissionForAction(
  key: Permission,
): Promise<ActionGuardResult> {
  const access = await getStaffAccess();
  if (hasPermission(access, key)) return { ok: true, access };
  return {
    ok: false,
    error: "You do not have permission to perform this action.",
  };
}

export async function requireAnyPermissionForAction(
  keys: readonly Permission[],
): Promise<ActionGuardResult> {
  const access = await getStaffAccess();
  if (hasAnyPermission(access, keys)) return { ok: true, access };
  return {
    ok: false,
    error: "You do not have permission to perform this action.",
  };
}

/**
 * Server-side guard for admin pages that have NO formal permission key
 * in the staff catalogue (e.g. /terms, /broadcasts, /studio-hire,
 * /penalties).
 *
 * Why this exists:
 *   The legacy `requireRole(["admin"])` lets through any user whose
 *   `users.role='admin'` — but `users.role` is set to `'admin'` for
 *   ANY non-teacher staff role (admin, front_desk, read_only, custom)
 *   by `legacyRoleForStaffRole()`. That is the legacy bypass: a Custom
 *   user with only `events:view` would silently retain access to
 *   /terms, /broadcasts, etc.
 *
 *   Pages that don't have a granular permission must therefore ask
 *   directly for super-admin access. The Staff & Permissions UI does
 *   not expose these pages as toggleable items, so super_admin is the
 *   correct gate.
 *
 *   Legacy admin fallback (a pre-staff `users.role='admin'` with NO
 *   `staff_role_key`) is treated as super_admin in the resolver, so
 *   existing single-admin installs keep working.
 */
export async function requireSuperAdmin(): Promise<StaffAccess> {
  const access = await getStaffAccess();
  if (access.isSuperAdmin) return access;
  redirect("/dashboard");
}

export async function requireSuperAdminForAction(): Promise<ActionGuardResult> {
  const access = await getStaffAccess();
  if (access.isSuperAdmin) return { ok: true, access };
  return {
    ok: false,
    error: "Only a Super Admin can perform this action.",
  };
}
