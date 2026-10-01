import type { UserRole } from "@/types/domain";
import type { Permission } from "@/lib/domain/permissions";

/**
 * Stable icon keys consumed by the client-side Sidebar's icon map.
 *
 * The previous shape stored a `LucideIcon` component on each NavItem,
 * which fails Next.js's Server Component → Client Component
 * serialization check ("Functions cannot be passed directly..."). We
 * now ship strings only; the actual lucide-react components live on the
 * client side in `components/layout/sidebar.tsx`.
 */
export type NavIconKey =
  | "dashboard"
  | "classes"
  | "bookings"
  | "events"
  | "catalog"
  | "attendance"
  | "students"
  | "terms"
  | "products"
  | "penalties"
  | "finance"
  | "affiliations"
  | "referrals"
  | "discountRules"
  | "broadcasts"
  | "studioHire"
  | "staff"
  | "settings";

export interface NavItem {
  name: string;
  href: string;
  /**
   * Stable string key. The client-side Sidebar maps this to a real
   * lucide-react icon component. Keeping it as a string makes the
   * whole NavItem fully serializable across the server/client
   * boundary.
   */
  iconKey: NavIconKey;
  /**
   * Legacy role-based gate. Kept for backwards compatibility (sidebar
   * still calls `getNavigationForRole` for non-staff routes such as
   * the student catalog). Newer admin pages prefer `permission`.
   */
  roles: UserRole[];
  /**
   * If set, the item is shown only when the resolved staff access
   * includes ANY of these permissions. Takes precedence over `roles`
   * for users who have a staff_role_key. The "any" semantics let us
   * declare e.g. ["students:view", "students:view_limited"] so a
   * Front-Desk role with only the limited view still sees the item.
   */
  permission?: Permission | Permission[];
}

export const NAVIGATION: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", iconKey: "dashboard", roles: ["admin", "teacher", "student"], permission: "dashboard:view" },
  { name: "Classes", href: "/classes", iconKey: "classes", roles: ["admin", "teacher", "student"], permission: "classes:view" },
  { name: "Bookings", href: "/bookings", iconKey: "bookings", roles: ["admin", "teacher", "student"], permission: "bookings:view" },
  { name: "Events", href: "/events", iconKey: "events", roles: ["admin", "student"], permission: "events:view" },
  { name: "Catalog", href: "/catalog", iconKey: "catalog", roles: ["student"] },
  { name: "Attendance", href: "/attendance", iconKey: "attendance", roles: ["admin", "teacher"], permission: "attendance:view" },
  { name: "Students", href: "/students", iconKey: "students", roles: ["admin"], permission: ["students:view", "students:view_limited"] },
  { name: "Terms", href: "/terms", iconKey: "terms", roles: ["admin"] },
  { name: "Products", href: "/products", iconKey: "products", roles: ["admin"], permission: "products:view" },
  { name: "Penalties", href: "/penalties", iconKey: "penalties", roles: ["admin"] },
  { name: "Finance", href: "/finance", iconKey: "finance", roles: ["admin"], permission: "finance:view" },
  { name: "Affiliations", href: "/affiliations", iconKey: "affiliations", roles: ["admin"], permission: "affiliations:view" },
  { name: "Referrals", href: "/referrals", iconKey: "referrals", roles: ["admin"], permission: "referrals:view" },
  { name: "Discount Rules", href: "/discount-rules", iconKey: "discountRules", roles: ["admin"], permission: "discounts:view" },
  { name: "Broadcasts", href: "/broadcasts", iconKey: "broadcasts", roles: ["admin"] },
  { name: "Studio Hire", href: "/studio-hire", iconKey: "studioHire", roles: ["admin"] },
  { name: "Staff & Permissions", href: "/staff", iconKey: "staff", roles: ["admin"], permission: "staff:view" },
  { name: "Settings", href: "/settings", iconKey: "settings", roles: ["admin"], permission: "settings:view" },
];

export function getNavigationForRole(role: UserRole): NavItem[] {
  return NAVIGATION.filter((item) => item.roles.includes(role));
}

/**
 * Permission-aware nav resolution.
 *
 * ── Dual-role behaviour (Phase 18) ─────────────────────────
 *
 * The result is the UNION of two independent entitlements:
 *
 *   `isStudent` → student-only items (Catalog, and anything else
 *                 whose `roles` set is exactly `["student"]`).
 *   permissions → every permission-gated staff item.
 *
 * So a Student + Teacher sees Catalog AND Attendance, because both
 * conditions hold. Nothing is subtracted for holding both. Previously
 * the student check was exclusive (`return legacyRole === 'student'`
 * short-circuited the whole item list), which is why a dual-role user
 * could only ever get one of the two sidebars.
 *
 * Precedence within a single item:
 *   - Student-only item → shown iff `isStudent`. Never leaks to pure
 *     staff. Page guards (`requireRole(["student"])`) enforce the
 *     same boundary server-side.
 *   - Item with a `permission` → shown iff the access bag holds any
 *     of the required permissions (super_admin always passes).
 *   - Item with NO `permission` → super_admin only. This closes the
 *     legacy bypass where a Custom/Front-Desk user with
 *     `users.role='admin'` would otherwise see /terms, /broadcasts,
 *     /studio-hire and /penalties despite holding no permission for
 *     them. The matching server guards use `requireSuperAdmin()`.
 *
 * Note it does NOT grant staff items off the back of a base role:
 * a dual-role user's staff navigation comes entirely from their
 * permission set, so a Teacher grant never exposes full admin nav.
 */
export function getNavigationForAccess(input: {
  /**
   * True when the user holds the student base role. Supersedes the
   * old `legacyRole` parameter, which conflated "is a student" with
   * "is not staff".
   */
  isStudent: boolean;
  permissions: ReadonlySet<Permission>;
  isSuperAdmin: boolean;
}): NavItem[] {
  return NAVIGATION.filter((item) => {
    const isStudentOnly =
      item.roles.length === 1 && item.roles[0] === "student";
    if (isStudentOnly) {
      return input.isStudent;
    }

    if (item.permission) {
      if (input.isSuperAdmin) return true;
      const required = Array.isArray(item.permission)
        ? item.permission
        : [item.permission];
      if (required.some((p) => input.permissions.has(p))) return true;
      // Fall through: a student with no staff permission still needs
      // the shared student items (Dashboard, Classes, Bookings,
      // Events) which are permission-gated but also student routes.
      return input.isStudent && item.roles.includes("student");
    }
    // No permission key, not student-only: super_admin only.
    return input.isSuperAdmin;
  });
}

const ROUTE_ACCESS: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/dashboard", roles: ["admin", "teacher", "student"] },
  { prefix: "/classes", roles: ["admin", "teacher", "student"] },
  { prefix: "/bookings", roles: ["admin", "teacher", "student"] },
  { prefix: "/events", roles: ["admin", "student"] },
  { prefix: "/catalog", roles: ["student"] },
  { prefix: "/attendance", roles: ["admin", "teacher"] },
  // Operational admin pages — staff with limited roles (front_desk,
  // teacher) need access to these to do their jobs. Page-level
  // `requirePermission(...:view)` calls do the actual gating.
  { prefix: "/students", roles: ["admin", "teacher"] },
  { prefix: "/finance", roles: ["admin", "teacher"] },
  { prefix: "/terms", roles: ["admin"] },
  { prefix: "/products", roles: ["admin", "teacher"] },
  { prefix: "/penalties", roles: ["admin"] },
  { prefix: "/affiliations", roles: ["admin", "teacher"] },
  { prefix: "/referrals", roles: ["admin", "teacher"] },
  { prefix: "/discount-rules", roles: ["admin", "teacher"] },
  { prefix: "/broadcasts", roles: ["admin"] },
  { prefix: "/studio-hire", roles: ["admin"] },
  { prefix: "/staff", roles: ["admin", "teacher"] },
  { prefix: "/settings", roles: ["admin", "teacher"] },
];

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const match = ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
  if (!match) return true;
  return match.roles.includes(role);
}
