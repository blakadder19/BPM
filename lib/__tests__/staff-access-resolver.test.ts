import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";

// Closures the mock implementations read so each test can swap them.
let CURRENT_USER: AuthUser | null = null;
let CURRENT_ROW: StaffMember | null = null;

vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    if (!CURRENT_USER) throw new Error("test forgot to set CURRENT_USER");
    return CURRENT_USER;
  },
}));

vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({
    getStaff: async () => CURRENT_ROW,
  }),
}));

// React.cache memoises within a request — tests share a process so we need
// to reset the module registry between tests to get a fresh resolver.
const importResolver = async () =>
  import("@/lib/staff-permissions").then((m) => m.getStaffAccess);

const baseUser = (overrides: Partial<AuthUser> = {}): AuthUser =>
  ({
    id: "user-1",
    email: "u@example.com",
    fullName: "U",
    role: "admin",
    emailConfirmed: true,
    ...overrides,
  }) as AuthUser;

const baseRow = (overrides: Partial<StaffMember> = {}): StaffMember => ({
  id: "user-1",
  email: "u@example.com",
  fullName: "U",
  legacyRole: "admin",
  roleKey: null,
  permissions: [],
  status: "active",
  invitedBy: null,
  updatedAt: null,
  createdAt: null,
  ...overrides,
});

describe("getStaffAccess (RBAC resolver — legacy bypass elimination)", () => {
  beforeEach(() => {
    vi.resetModules();
    CURRENT_USER = null;
    CURRENT_ROW = null;
  });

  it("users.role='admin' + staff_role_key='custom' + staff_permissions=[] => no permissions, NOT super_admin", async () => {
    CURRENT_USER = baseUser({ role: "admin" });
    CURRENT_ROW = baseRow({ roleKey: "custom", permissions: [], status: "active" });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.roleKey).toBe("custom");
    expect(access.permissions.size).toBe(0);
    expect(access.isLegacyAdminFallback).toBe(false);
  });

  it("users.role='admin' + staff_role_key='teacher' => only teacher permissions, NOT super_admin", async () => {
    CURRENT_USER = baseUser({ role: "admin" });
    CURRENT_ROW = baseRow({ roleKey: "teacher", permissions: [], status: "active" });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.roleKey).toBe("teacher");
    expect(access.permissions.has("products:create")).toBe(false);
    expect(access.permissions.has("staff:edit_permissions")).toBe(false);
    expect(access.permissions.has("settings:edit")).toBe(false);
  });

  it("users.role='admin' + staff_role_key='read_only' + permissions=[] => only read permissions", async () => {
    CURRENT_USER = baseUser({ role: "admin" });
    CURRENT_ROW = baseRow({ roleKey: "read_only", permissions: [], status: "active" });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.permissions.has("products:create")).toBe(false);
    expect(access.permissions.has("events:create")).toBe(false);
    expect(access.permissions.has("classes:create")).toBe(false);
  });

  it("users.role='admin' + staff_role_key=null => legacy super_admin fallback", async () => {
    CURRENT_USER = baseUser({ role: "admin" });
    CURRENT_ROW = baseRow({ roleKey: null, permissions: [], status: "active" });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(true);
    expect(access.isLegacyAdminFallback).toBe(true);
    expect(access.permissions.has("products:create")).toBe(true);
    expect(access.permissions.has("staff:edit_permissions")).toBe(true);
  });

  it("staff row with status='disabled' => empty permission set (deny-by-default)", async () => {
    CURRENT_USER = baseUser({ role: "admin" });
    CURRENT_ROW = baseRow({
      roleKey: "super_admin",
      permissions: [],
      status: "disabled",
    });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.permissions.size).toBe(0);
  });

  it("super_admin row => all permissions, isSuperAdmin=true", async () => {
    CURRENT_USER = baseUser({ role: "admin" });
    CURRENT_ROW = baseRow({ roleKey: "super_admin", permissions: [], status: "active" });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(true);
    expect(access.permissions.size).toBeGreaterThan(20);
  });

  it("students get an empty permission set regardless of staff row", async () => {
    CURRENT_USER = baseUser({ role: "student" });
    CURRENT_ROW = baseRow({ roleKey: "super_admin", permissions: [], status: "active" });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.permissions.size).toBe(0);
    expect(access.roleKey).toBe(null);
  });

  it("teacher with no staff row => teacher preset permissions (legacy fallback)", async () => {
    CURRENT_USER = baseUser({ role: "teacher" });
    CURRENT_ROW = null;
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.roleKey).toBe("teacher");
    expect(access.isLegacyAdminFallback).toBe(true);
  });

  it("custom role with explicit events:view extra => exactly that permission", async () => {
    CURRENT_USER = baseUser({ role: "admin" });
    CURRENT_ROW = baseRow({
      roleKey: "custom",
      permissions: ["events:view"],
      status: "active",
    });
    const getStaffAccess = await importResolver();

    const access = await getStaffAccess();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.permissions.has("events:view")).toBe(true);
    expect(access.permissions.has("events:create")).toBe(false);
    expect(access.permissions.has("products:view")).toBe(false);
    expect(access.permissions.size).toBe(1);
  });
});
