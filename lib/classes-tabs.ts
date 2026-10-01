import type { Permission } from "@/lib/domain/permissions";
import type { StaffAccess } from "@/lib/staff-permissions";

export interface ClassesTab {
  label: string;
  href: string;
}

/** Each tab's permission must match the `requirePermission` on its page. */
const CLASSES_TABS: readonly (ClassesTab & { permission: Permission })[] = [
  { label: "Templates", href: "/classes", permission: "classes:view" },
  { label: "Schedule", href: "/classes/bookable", permission: "classes:view" },
  { label: "Teachers", href: "/classes/teachers", permission: "teachers:view" },
];

/**
 * Staff tabs shown above /classes. The student base role gets the student
 * classes page and no tabs; staff only see tabs whose page they can open.
 */
export function visibleClassesTabs(
  baseRole: string,
  access: Pick<StaffAccess, "isSuperAdmin" | "permissions"> | null,
): ClassesTab[] {
  if (baseRole === "student" || !access) return [];
  return CLASSES_TABS
    .filter((t) => access.isSuperAdmin || access.permissions.has(t.permission))
    .map(({ label, href }) => ({ label, href }));
}
