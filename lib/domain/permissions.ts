/**
 * Staff permissions — pure domain layer.
 *
 * This module defines the permission catalogue, role presets, and
 * sensitive-permission classification used by the new Staff &
 * Permissions admin module. It is intentionally pure (no IO, no
 * Supabase, no Next.js) so it can be imported anywhere.
 *
 * MVP shape (per 2026-04-29 design decisions):
 *
 *   - The legacy `users.role` enum (admin / teacher / student) is kept.
 *   - We layer a `staff_role_key` + `staff_permissions` jsonb on top
 *     for any user that should have admin-area access.
 *   - Existing `role='admin'` users are auto-promoted to
 *     `super_admin` on first read if they have no staff_role_key yet,
 *     so this feature is invisible to current super-admins.
 *   - Students never have any staff permissions.
 *
 * Permission key shape: "<resource>:<action>", lowercase.
 */

export const PERMISSION_KEYS = [
  // Dashboard
  "dashboard:view",

  // Students
  "students:view",
  "students:view_limited",
  "students:create",
  "students:edit",
  "students:delete",
  "students:view_finance",
  "students:manage_affiliations",

  // Bookings
  "bookings:view",
  "bookings:create",
  "bookings:cancel",
  "bookings:restore",
  "bookings:delete",

  // Attendance
  "attendance:view",
  "attendance:mark_present",
  "attendance:mark_absent",
  "attendance:edit_history",

  // Check-in / QR
  "checkin:view",
  "checkin:scan",
  "checkin:manual_checkin",

  // Payments
  "payments:view",
  "payments:view_limited",
  "payments:mark_paid_reception",
  "payments:refund",
  "payments:delete_test_data",

  // Products
  "products:view",
  "products:create",
  "products:edit",
  "products:archive",
  "products:delete",

  // Discounts
  "discounts:view",
  "discounts:create",
  "discounts:edit",
  "discounts:delete",
  "discounts:preview",

  // Affiliations
  "affiliations:view",
  "affiliations:create",
  "affiliations:edit",
  "affiliations:delete",
  "affiliations:verify",

  // Events
  "events:view",
  "events:create",
  "events:edit",
  "events:delete",
  "events:mark_paid",

  // Classes
  "classes:view",
  "classes:create",
  "classes:edit",
  "classes:delete",
  "classes:cancel",

  // Teachers
  "teachers:view",
  "teachers:create",
  "teachers:edit",
  "teachers:delete",

  // Settings
  "settings:view",
  "settings:edit",

  // Staff & Permissions
  "staff:view",
  "staff:invite",
  "staff:edit_permissions",
  "staff:disable",
  "staff:revoke_invite",

  // Finance dashboard
  "finance:view",
  "finance:mark_paid",
  "finance:refund",
  "finance:danger_zone",
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSION_KEYS);

export function isPermissionKey(key: string): key is Permission {
  return PERMISSION_SET.has(key);
}

/**
 * Permissions flagged as sensitive get a visible warning in the
 * Staff & Permissions UI when a non-super-admin user is granted them.
 *
 * They do NOT change enforcement — this is purely UX so the academy
 * doesn't accidentally hand out finance-affecting power.
 */
export const SENSITIVE_PERMISSIONS: readonly Permission[] = [
  "finance:refund",
  "finance:danger_zone",
  "settings:edit",
  "products:edit",
  "products:delete",
  "staff:edit_permissions",
  "payments:mark_paid_reception",
  "payments:refund",
  "discounts:edit",
  "discounts:delete",
];

const SENSITIVE_SET: ReadonlySet<string> = new Set(SENSITIVE_PERMISSIONS);

export function isSensitivePermission(p: Permission): boolean {
  return SENSITIVE_SET.has(p);
}

export const STAFF_ROLE_KEYS = [
  "super_admin",
  "admin",
  "front_desk",
  "teacher",
  "read_only",
  "custom",
] as const;

export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];

export const STAFF_ROLE_LABELS: Record<StaffRoleKey, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  front_desk: "Front Desk",
  teacher: "Teacher",
  read_only: "Read Only",
  custom: "Custom",
};

export const STAFF_STATUSES = ["active", "disabled", "pending"] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

/**
 * Role preset → permission set.
 *
 * `super_admin` is a sentinel: implementations should treat it as
 * "all permissions" rather than relying on this list staying exhaustive
 * over time. We still include the full list here for completeness and
 * for the Staff editor UI.
 */
export const ROLE_PRESETS: Record<StaffRoleKey, readonly Permission[]> = {
  super_admin: PERMISSION_KEYS,

  admin: [
    "dashboard:view",
    "students:view",
    "students:create",
    "students:edit",
    "students:view_finance",
    "students:manage_affiliations",
    "bookings:view",
    "bookings:create",
    "bookings:cancel",
    "bookings:restore",
    "attendance:view",
    "attendance:mark_present",
    "attendance:mark_absent",
    "attendance:edit_history",
    "checkin:view",
    "checkin:scan",
    "checkin:manual_checkin",
    "payments:view",
    "payments:mark_paid_reception",
    "products:view",
    "products:create",
    "products:edit",
    "products:archive",
    "discounts:view",
    "discounts:create",
    "discounts:edit",
    "discounts:preview",
    "affiliations:view",
    "affiliations:create",
    "affiliations:edit",
    "affiliations:verify",
    "events:view",
    "events:create",
    "events:edit",
    "events:mark_paid",
    "classes:view",
    "classes:create",
    "classes:edit",
    "classes:cancel",
    "teachers:view",
    "teachers:create",
    "teachers:edit",
    "settings:view",
    "finance:view",
    "finance:mark_paid",
  ],

  front_desk: [
    "dashboard:view",
    "students:view",
    "students:view_limited",
    "bookings:view",
    "bookings:create",
    "bookings:cancel",
    "attendance:view",
    "attendance:mark_present",
    "checkin:view",
    "checkin:scan",
    "checkin:manual_checkin",
    "payments:view_limited",
    "payments:mark_paid_reception",
  ],

  teacher: [
    "dashboard:view",
    "students:view_limited",
    "bookings:view",
    "attendance:view",
    "attendance:mark_present",
    "checkin:view",
    "checkin:scan",
    "checkin:manual_checkin",
    "payments:view_limited",
    "payments:mark_paid_reception",
  ],

  read_only: [
    "dashboard:view",
    "students:view",
    "bookings:view",
    "attendance:view",
    "checkin:view",
    "payments:view",
    "products:view",
    "discounts:view",
    "affiliations:view",
    "events:view",
    "classes:view",
    "teachers:view",
    "settings:view",
    "finance:view",
  ],

  custom: [],
};

/**
 * Produce the effective permission set for a staff member.
 *
 * Resolution order (Model A — preset + custom additions):
 *   1. super_admin → ALL permissions (sentinel; ignores `override`)
 *   2. custom     → use `override` verbatim (or empty if missing)
 *   3. otherwise  → ROLE_PRESETS[roleKey] union with `override` (override
 *                   ADDS, never silently removes — to remove a preset
 *                   permission the caller must switch role_key='custom').
 *
 * IMPORTANT: For non-Custom roles, the `override` list is stored as
 * "additions only" (perms NOT already in the preset). `expandPermissions`
 * still does a defensive UNION with the preset so legacy rows that were
 * persisted with `[preset + extras]` continue to expand correctly.
 */
export function expandPermissions(
  roleKey: StaffRoleKey | null,
  override: readonly Permission[] | null | undefined,
): Set<Permission> {
  if (roleKey === "super_admin") {
    return new Set<Permission>(PERMISSION_KEYS);
  }
  if (roleKey === "custom") {
    return new Set<Permission>(override ?? []);
  }
  const base = roleKey ? ROLE_PRESETS[roleKey] : [];
  const out = new Set<Permission>(base);
  for (const p of override ?? []) out.add(p);
  return out;
}

/**
 * Normalize the permission list saved into `staff_permissions` for
 * persistence. This is the source of truth for the storage shape:
 *
 *   - super_admin → []  (sentinel — preset is ALL keys, no overrides
 *                        ever needed)
 *   - custom      → exact list (deduped, sanitized)
 *   - otherwise   → ADDITIONS ONLY (perms NOT already in the preset),
 *                   deduped and sanitized.
 *
 * Why "additions only" for non-Custom: if we stored `preset + extras`,
 * then changing the role would leak old preset perms into the override
 * because the stored list still contains them. Storing only the delta
 * makes role changes deterministic and the editor reflect what's
 * actually granted on top of the preset.
 *
 * The function is pure and safe to call from both the client editor
 * (when computing what to send to the server) and the server actions
 * (defence-in-depth).
 */
export function normalizePermissionsForStorage(
  roleKey: StaffRoleKey,
  permissions: readonly Permission[],
): Permission[] {
  if (roleKey === "super_admin") return [];
  const dedup = Array.from(new Set(permissions.filter(isPermissionKey)));
  if (roleKey === "custom") return dedup;
  const presetSet = new Set<Permission>(ROLE_PRESETS[roleKey]);
  return dedup.filter((p) => !presetSet.has(p));
}

/**
 * Module groupings used by the Staff & Permissions editor UI.
 *
 * Keep these as data — the UI iterates over them so adding a new
 * permission only requires touching this file.
 */
export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: Permission; label: string; description?: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    permissions: [{ key: "dashboard:view", label: "View dashboard" }],
  },
  {
    key: "students",
    label: "Students",
    permissions: [
      { key: "students:view", label: "View full student profiles" },
      { key: "students:view_limited", label: "View limited student info (no finance)" },
      { key: "students:create", label: "Create students" },
      { key: "students:edit", label: "Edit students" },
      { key: "students:delete", label: "Delete students", description: "Destructive — usually super-admin only." },
      { key: "students:view_finance", label: "See student finance details" },
      { key: "students:manage_affiliations", label: "Manage student affiliations" },
    ],
  },
  {
    key: "bookings",
    label: "Bookings",
    permissions: [
      { key: "bookings:view", label: "View bookings" },
      { key: "bookings:create", label: "Create bookings" },
      { key: "bookings:cancel", label: "Cancel bookings" },
      { key: "bookings:restore", label: "Restore cancelled bookings" },
      { key: "bookings:delete", label: "Delete bookings" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    permissions: [
      { key: "attendance:view", label: "View attendance" },
      { key: "attendance:mark_present", label: "Mark attendance: present" },
      { key: "attendance:mark_absent", label: "Mark attendance: absent" },
      { key: "attendance:edit_history", label: "Edit historical attendance" },
    ],
  },
  {
    key: "checkin",
    label: "Check-in / QR",
    permissions: [
      { key: "checkin:view", label: "Open check-in page" },
      { key: "checkin:scan", label: "Scan student QR codes" },
      { key: "checkin:manual_checkin", label: "Manually check in walk-ins" },
    ],
  },
  {
    key: "payments",
    label: "Payments (operational)",
    permissions: [
      { key: "payments:view", label: "View all payments" },
      { key: "payments:view_limited", label: "View payment status only" },
      { key: "payments:mark_paid_reception", label: "Mark reception payments as paid", description: "Allows marking pending purchases as paid at the desk." },
      { key: "payments:refund", label: "Refund payments", description: "Sensitive — affects finance ledger." },
      { key: "payments:delete_test_data", label: "Delete test payments" },
    ],
  },
  {
    key: "products",
    label: "Products & Catalog",
    permissions: [
      { key: "products:view", label: "View products" },
      { key: "products:create", label: "Create products" },
      { key: "products:edit", label: "Edit product prices and access rules", description: "Sensitive — affects future pricing engine evaluations." },
      { key: "products:archive", label: "Archive products" },
      { key: "products:delete", label: "Delete products" },
    ],
  },
  {
    key: "discounts",
    label: "Discount Rules",
    permissions: [
      { key: "discounts:view", label: "View discount rules" },
      { key: "discounts:create", label: "Create discount rules" },
      { key: "discounts:edit", label: "Edit discount rules" },
      { key: "discounts:delete", label: "Delete discount rules" },
      { key: "discounts:preview", label: "Run discount preview tool" },
    ],
  },
  {
    key: "affiliations",
    label: "Affiliations",
    permissions: [
      { key: "affiliations:view", label: "View affiliations" },
      { key: "affiliations:create", label: "Create affiliations" },
      { key: "affiliations:edit", label: "Edit affiliations" },
      { key: "affiliations:delete", label: "Delete affiliations" },
      { key: "affiliations:verify", label: "Verify / reject / expire affiliations" },
    ],
  },
  {
    key: "events",
    label: "Events",
    permissions: [
      { key: "events:view", label: "View events" },
      { key: "events:create", label: "Create events" },
      { key: "events:edit", label: "Edit events" },
      { key: "events:delete", label: "Delete events" },
      { key: "events:mark_paid", label: "Mark event purchases paid" },
    ],
  },
  {
    key: "classes",
    label: "Classes",
    permissions: [
      { key: "classes:view", label: "View classes" },
      { key: "classes:create", label: "Create classes" },
      { key: "classes:edit", label: "Edit classes" },
      { key: "classes:delete", label: "Delete classes" },
      { key: "classes:cancel", label: "Cancel classes" },
    ],
  },
  {
    key: "teachers",
    label: "Teachers",
    permissions: [
      { key: "teachers:view", label: "View teachers" },
      { key: "teachers:create", label: "Create teachers" },
      { key: "teachers:edit", label: "Edit teachers" },
      { key: "teachers:delete", label: "Delete teachers" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    permissions: [
      { key: "settings:view", label: "View settings" },
      { key: "settings:edit", label: "Edit settings", description: "Sensitive — controls global business rules." },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    permissions: [
      { key: "finance:view", label: "Open Finance dashboard" },
      { key: "finance:mark_paid", label: "Mark finance rows as paid" },
      { key: "finance:refund", label: "Refund through Finance", description: "Sensitive." },
      { key: "finance:danger_zone", label: "Finance danger zone (delete test data, etc.)", description: "Sensitive — destructive operations." },
    ],
  },
  {
    key: "staff",
    label: "Staff & Permissions",
    permissions: [
      { key: "staff:view", label: "Open Staff & Permissions" },
      { key: "staff:invite", label: "Invite staff" },
      { key: "staff:edit_permissions", label: "Edit staff permissions", description: "Sensitive — can grant any other permission." },
      { key: "staff:disable", label: "Disable / enable staff access" },
      { key: "staff:revoke_invite", label: "Revoke pending invites" },
    ],
  },
];
