import type { StaffAccess } from "@/lib/staff-permissions";

export type DashboardView = "student" | "staff" | "no_staff_access";

/**
 * Which dashboard a user gets. The student base role keeps the student
 * dashboard (including Student + Teacher). Everyone else needs an active
 * staff grant with `dashboard:view`; `users.role` alone is never enough.
 */
export function resolveDashboardView(
  baseRole: string,
  access: Pick<StaffAccess, "isSuperAdmin" | "permissions"> | null,
): DashboardView {
  if (baseRole === "student") return "student";
  if (access && (access.isSuperAdmin || access.permissions.has("dashboard:view"))) {
    return "staff";
  }
  return "no_staff_access";
}
