/**
 * Phase 18 — dual-role access model.
 *
 * The regression this locks down: `getStaffAccess()` used to return an
 * empty permission set whenever `users.role === 'student'`, WITHOUT
 * reading `staff_role_key`. An existing student granted Teacher access
 * therefore got nothing, and the only workaround was to flip their
 * base role — which destroyed their student functionality.
 *
 * These tests assert that the staff grant is authoritative and
 * independent of the base role, while student access survives.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ROLE_PRESETS, type Permission, type StaffRoleKey, type StaffStatus } from "@/lib/domain/permissions";

const TEACHER_DEFAULTS = [...ROLE_PRESETS.teacher];

// ── Mocks ────────────────────────────────────────────────────

interface FakeUser {
  id: string;
  email: string;
  fullName: string;
  role: "student" | "teacher" | "admin";
  emailConfirmed: boolean;
}

interface FakeStaffRow {
  id: string;
  roleKey: StaffRoleKey | null;
  permissions: Permission[] | null;
  status: StaffStatus;
}

let CURRENT_USER: FakeUser | null = null;
let STAFF_ROW: FakeStaffRow | null = null;

vi.mock("react", async (orig) => {
  const actual = await orig<typeof import("react")>();
  return {
    ...actual,
    // React.cache memoises per-render; in tests we want each call to
    // re-read the mutable fixtures above.
    cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => {
    if (!CURRENT_USER) throw new Error("not authenticated");
    return CURRENT_USER;
  }),
}));

vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({
    async getStaff() {
      return STAFF_ROW;
    },
  }),
}));

import {
  getStaffAccess,
  hasPermission,
  resolveRoleLabel,
} from "@/lib/staff-permissions";
import { getNavigationForAccess } from "@/lib/role-config";

function student(over: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "u-1",
    email: "guille@example.com",
    fullName: "Guille",
    role: "student",
    emailConfirmed: true,
    ...over,
  };
}

function staffRow(over: Partial<FakeStaffRow> = {}): FakeStaffRow {
  return {
    id: "u-1",
    roleKey: "teacher",
    permissions: null,
    status: "active",
    ...over,
  };
}

beforeEach(() => {
  CURRENT_USER = student();
  STAFF_ROW = null;
});

// ── Pure student ─────────────────────────────────────────────

describe("pure student", () => {
  it("has no staff permissions and is not staff", async () => {
    const a = await getStaffAccess();
    expect(a.isStudent).toBe(true);
    expect(a.isStaff).toBe(false);
    expect(a.roleKey).toBeNull();
    expect(a.permissions.size).toBe(0);
    expect(a.isSuperAdmin).toBe(false);
  });

  it("reads as 'Student'", async () => {
    expect(resolveRoleLabel(await getStaffAccess())).toBe("Student");
  });

  it("gets Catalog but no staff-only navigation", async () => {
    const a = await getStaffAccess();
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).toContain("/catalog");
    expect(hrefs).not.toContain("/attendance");
    expect(hrefs).not.toContain("/staff");
    expect(hrefs).not.toContain("/settings");
  });

  it("a student row with roleKey null is still just a student", async () => {
    STAFF_ROW = staffRow({ roleKey: null });
    const a = await getStaffAccess();
    expect(a.isStaff).toBe(false);
    expect(a.permissions.size).toBe(0);
  });
});

// ── Student + active Teacher (the headline case) ─────────────

describe("student + ACTIVE teacher grant", () => {
  beforeEach(() => {
    STAFF_ROW = staffRow({ roleKey: "teacher", permissions: TEACHER_DEFAULTS, status: "active" });
  });

  it("is BOTH student and staff — neither identity is collapsed", async () => {
    const a = await getStaffAccess();
    expect(a.isStudent).toBe(true);
    expect(a.isStaff).toBe(true);
    expect(a.roleKey).toBe("teacher");
  });

  it("receives exactly the stored Teacher grant despite base role 'student'", async () => {
    const a = await getStaffAccess();
    expect([...a.permissions].sort()).toEqual([...TEACHER_DEFAULTS].sort());
    expect(hasPermission(a, "attendance:mark_present")).toBe(true);
    expect(hasPermission(a, "students:view_limited")).toBe(true);
  });

  it("staff functionality follows the exact checked list, student access stays", async () => {
    STAFF_ROW = staffRow({ roleKey: "teacher", permissions: ["classes:view"], status: "active" });
    const a = await getStaffAccess();
    expect(a.isStudent).toBe(true);
    expect(hasPermission(a, "attendance:view")).toBe(false);
    expect(hasPermission(a, "checkin:scan")).toBe(false);
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).toContain("/catalog");
    expect(hrefs).toContain("/classes");
    expect(hrefs).not.toContain("/attendance");
    expect(hrefs).not.toContain("/finance");
  });

  it("does NOT receive super-admin powers", async () => {
    const a = await getStaffAccess();
    expect(a.isSuperAdmin).toBe(false);
    expect(hasPermission(a, "settings:edit")).toBe(false);
    expect(hasPermission(a, "staff:invite")).toBe(false);
  });

  it("reads as 'Student · Teacher'", async () => {
    expect(resolveRoleLabel(await getStaffAccess())).toBe("Student · Teacher");
  });

  it("KEEPS Catalog access", async () => {
    const a = await getStaffAccess();
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).toContain("/catalog");
  });

  it("ALSO gets Teacher navigation", async () => {
    const a = await getStaffAccess();
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).toContain("/attendance");
    expect(hrefs).toContain("/dashboard");
  });

  it("does not get full admin navigation", async () => {
    const a = await getStaffAccess();
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).not.toContain("/staff");
    expect(hrefs).not.toContain("/broadcasts");
    expect(hrefs).not.toContain("/studio-hire");
  });
});

// ── Disabled / pending grants ───────────────────────────────

describe("student + DISABLED teacher grant", () => {
  beforeEach(() => {
    STAFF_ROW = staffRow({ roleKey: "teacher", status: "disabled" });
  });

  it("conveys no staff permissions", async () => {
    const a = await getStaffAccess();
    expect(a.isStaff).toBe(false);
    expect(a.permissions.size).toBe(0);
    expect(hasPermission(a, "attendance:mark_present")).toBe(false);
  });

  it("still reports the roleKey so admin UI can label it", async () => {
    const a = await getStaffAccess();
    expect(a.roleKey).toBe("teacher");
    expect(a.status).toBe("disabled");
  });

  it("keeps student access", async () => {
    const a = await getStaffAccess();
    expect(a.isStudent).toBe(true);
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).toContain("/catalog");
    expect(hrefs).not.toContain("/attendance");
  });

  it("does not advertise the staff role in the label", async () => {
    expect(resolveRoleLabel(await getStaffAccess())).toBe("Student");
  });
});

describe("student + PENDING teacher grant", () => {
  it("conveys no permissions until activated", async () => {
    STAFF_ROW = staffRow({ roleKey: "teacher", status: "pending" });
    const a = await getStaffAccess();
    expect(a.isStaff).toBe(false);
    expect(a.permissions.size).toBe(0);
    expect(a.isStudent).toBe(true);
  });
});

// ── Custom role + overrides ─────────────────────────────────

describe("student + custom staff role", () => {
  it("receives exactly the custom permission list", async () => {
    STAFF_ROW = staffRow({
      roleKey: "custom",
      permissions: ["finance:view", "students:view"],
      status: "active",
    });
    const a = await getStaffAccess();
    expect(a.isStudent).toBe(true);
    expect(a.isStaff).toBe(true);
    expect(hasPermission(a, "finance:view")).toBe(true);
    expect(hasPermission(a, "students:view")).toBe(true);
    // Not in the list → denied.
    expect(hasPermission(a, "settings:edit")).toBe(false);
  });

  it("surfaces the matching navigation plus Catalog", async () => {
    STAFF_ROW = staffRow({
      roleKey: "custom",
      permissions: ["finance:view"],
      status: "active",
    });
    const a = await getStaffAccess();
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).toContain("/finance");
    expect(hrefs).toContain("/catalog");
    expect(hrefs).not.toContain("/settings");
  });

  it("reads as 'Student · Custom'", async () => {
    STAFF_ROW = staffRow({ roleKey: "custom", permissions: [], status: "active" });
    expect(resolveRoleLabel(await getStaffAccess())).toBe("Student · Custom");
  });
});

// ── Admin / super-admin regression ──────────────────────────

describe("admin and super-admin regression", () => {
  it("super_admin grant gets everything and is not a student", async () => {
    CURRENT_USER = student({ role: "admin", email: "zaria@example.com" });
    STAFF_ROW = staffRow({ roleKey: "super_admin", status: "active" });
    const a = await getStaffAccess();
    expect(a.isSuperAdmin).toBe(true);
    expect(a.isStaff).toBe(true);
    expect(a.isStudent).toBe(false);
    expect(hasPermission(a, "settings:edit")).toBe(true);
    expect(resolveRoleLabel(a)).toBe("Super Admin");
  });

  it("super_admin never sees Catalog", async () => {
    CURRENT_USER = student({ role: "admin" });
    STAFF_ROW = staffRow({ roleKey: "super_admin", status: "active" });
    const a = await getStaffAccess();
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).not.toContain("/catalog");
    expect(hrefs).toContain("/settings");
  });

  it("legacy role=admin with NO staff grant still resolves to super_admin", async () => {
    CURRENT_USER = student({ role: "admin" });
    STAFF_ROW = staffRow({ roleKey: null });
    const a = await getStaffAccess();
    expect(a.isSuperAdmin).toBe(true);
    expect(a.isLegacyAdminFallback).toBe(true);
    expect(a.isStudent).toBe(false);
  });

  it("legacy role=teacher with NO staff grant gets no implicit teacher preset", async () => {
    CURRENT_USER = student({ role: "teacher" });
    STAFF_ROW = null;
    const a = await getStaffAccess();
    expect(a.roleKey).toBeNull();
    expect(a.isStaff).toBe(false);
    expect(a.isStudent).toBe(false);
    expect(a.isLegacyAdminFallback).toBe(false);
    expect(hasPermission(a, "attendance:mark_present")).toBe(false);
  });

  it("a pure teacher does not see Catalog", async () => {
    CURRENT_USER = student({ role: "teacher" });
    STAFF_ROW = staffRow({ roleKey: "teacher", permissions: TEACHER_DEFAULTS, status: "active" });
    const a = await getStaffAccess();
    const hrefs = getNavigationForAccess({
      isStudent: a.isStudent,
      permissions: a.permissions,
      isSuperAdmin: a.isSuperAdmin,
    }).map((i) => i.href);
    expect(hrefs).not.toContain("/catalog");
    expect(hrefs).toContain("/attendance");
  });

  it("a disabled super_admin loses everything", async () => {
    CURRENT_USER = student({ role: "admin" });
    STAFF_ROW = staffRow({ roleKey: "super_admin", status: "disabled" });
    const a = await getStaffAccess();
    expect(a.isSuperAdmin).toBe(false);
    expect(a.isStaff).toBe(false);
    expect(a.permissions.size).toBe(0);
  });
});

// ── Security invariants ─────────────────────────────────────

describe("security invariants", () => {
  it("staff_role_key alone is NOT sufficient — status must be active", async () => {
    for (const status of ["disabled", "pending"] as StaffStatus[]) {
      STAFF_ROW = staffRow({ roleKey: "super_admin", status });
      const a = await getStaffAccess();
      expect(a.isStaff).toBe(false);
      expect(a.isSuperAdmin).toBe(false);
      expect(a.permissions.size).toBe(0);
    }
  });

  it("custom overrides are respected, not widened to a preset", async () => {
    STAFF_ROW = staffRow({
      roleKey: "custom",
      permissions: ["students:view"],
      status: "active",
    });
    const a = await getStaffAccess();
    expect(hasPermission(a, "students:view")).toBe(true);
    expect(hasPermission(a, "students:delete")).toBe(false);
    expect(hasPermission(a, "finance:danger_zone")).toBe(false);
  });

  it("base role is never used to grant staff permissions on its own", async () => {
    // A student with no grant gets nothing, whatever else is true.
    CURRENT_USER = student();
    STAFF_ROW = null;
    const a = await getStaffAccess();
    expect(a.permissions.size).toBe(0);
  });
});
