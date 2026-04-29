import { cache } from "react";
import { redirect } from "next/navigation";
import { requireAuth, type AuthUser } from "@/lib/auth";
import { getStaffRepo } from "@/lib/repositories";
import {
  expandPermissions,
  type Permission,
  type StaffRoleKey,
  type StaffStatus,
} from "@/lib/domain/permissions";

/**
 * Resolved staff access for the current user.
 *
 * `permissions` is the EFFECTIVE permission set after expanding the
 * role preset against the per-user override. For super_admin it always
 * contains every permission key.
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
}

const STUDENT_ACCESS = (user: AuthUser): StaffAccess => ({
  user,
  roleKey: null,
  status: "active",
  permissions: new Set(),
  isSuperAdmin: false,
  isLegacyAdminFallback: false,
});

/**
 * Resolve staff access for the current request, deduplicated via
 * React.cache so multiple page/action calls share one DB read.
 *
 * Priority:
 *   1. Students always get an empty permission set.
 *   2. If a staff row exists, its roleKey + override is the source of
 *      truth. `super_admin` short-circuits to ALL permissions.
 *   3. Legacy fallback: if no staff row but `users.role==='admin'`,
 *      treat the user as `super_admin`. This keeps the existing single
 *      admin working transparently after the migration.
 *   4. Otherwise (no staff row, role==='teacher') → no permissions.
 *
 * Disabled status overrides everything: a disabled staff member has an
 * empty permission set even if their role would normally grant access.
 */
export const getStaffAccess = cache(async (): Promise<StaffAccess> => {
  const user = await requireAuth();
  if (user.role === "student") return STUDENT_ACCESS(user);

  let row = null;
  try {
    row = await getStaffRepo().getStaff(user.id);
  } catch {
    // Repo may not be reachable in some unit-test contexts — fall
    // through to the legacy admin fallback below.
  }

  if (row) {
    if (row.status === "disabled") {
      return {
        user,
        roleKey: row.roleKey,
        status: "disabled",
        permissions: new Set(),
        isSuperAdmin: false,
        isLegacyAdminFallback: false,
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
    };
  }

  // Legacy fallback: pre-existing role=teacher without a staff_role_key
  // gets the standard Teacher preset (QR scan, check-in, mark-paid at
  // reception, limited student view). This mirrors the migration 00059
  // backfill and protects environments where the migration hasn't run
  // yet (e.g. memory mode in tests or freshly-cloned dev DBs).
  if (user.role === "teacher") {
    return {
      user,
      roleKey: "teacher",
      status: "active",
      permissions: expandPermissions("teacher", null),
      isSuperAdmin: false,
      isLegacyAdminFallback: true,
    };
  }

  return {
    user,
    roleKey: null,
    status: "active",
    permissions: new Set(),
    isSuperAdmin: false,
    isLegacyAdminFallback: false,
  };
});

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
