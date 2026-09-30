/**
 * Disabled or pending staff must not regain permissions through the legacy
 * `users.role` fallback, and the staff dashboard follows the resolved
 * staff access rather than `users.role`.
 *
 * The "legacy teacher" fixtures reproduce the production shape of the
 * seed teacher accounts (users.role='teacher', staff_role_key NULL,
 * staff_status 'disabled') with synthetic ids and emails.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";
import { resolveDashboardView } from "@/lib/dashboard-access";

let CURRENT_USER: AuthUser | null = null;
let CURRENT_ROW: StaffMember | null = null;

vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    if (!CURRENT_USER) throw new Error("test forgot to set CURRENT_USER");
    return CURRENT_USER;
  },
}));
vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({ getStaff: async () => CURRENT_ROW }),
}));

const loadResolver = async () =>
  import("@/lib/staff-permissions").then((m) => m.getStaffAccess);

const user = (role: AuthUser["role"]): AuthUser => ({
  id: "fixture-user",
  email: "fixture@example.test",
  fullName: "Fixture",
  role,
  avatarUrl: null,
  academyId: "fixture-academy",
  emailConfirmed: true,
});

const row = (over: Partial<StaffMember>): StaffMember => ({
  id: "fixture-user",
  email: "fixture@example.test",
  fullName: "Fixture",
  legacyRole: "teacher",
  roleKey: null,
  permissions: [],
  status: "active",
  invitedBy: null,
  updatedAt: null,
  createdAt: null,
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  CURRENT_USER = null;
  CURRENT_ROW = null;
});

describe("legacy fallback respects staff_status", () => {
  it("legacy teacher (role=teacher, roleKey=null, disabled) gets no permissions", async () => {
    CURRENT_USER = user("teacher");
    CURRENT_ROW = row({ legacyRole: "teacher", status: "disabled" });
    const access = await (await loadResolver())();
    expect(access.permissions.size).toBe(0);
    expect(access.isStaff).toBe(false);
    expect(access.isLegacyAdminFallback).toBe(false);
    expect(access.permissions.has("checkin:scan")).toBe(false);
    expect(access.status).toBe("disabled");
  });

  it("legacy admin (role=admin, roleKey=null, disabled) is NOT a super admin", async () => {
    CURRENT_USER = user("admin");
    CURRENT_ROW = row({ legacyRole: "admin", status: "disabled" });
    const access = await (await loadResolver())();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.permissions.size).toBe(0);
  });

  it("pending never gains active permissions through the legacy role", async () => {
    CURRENT_USER = user("admin");
    CURRENT_ROW = row({ legacyRole: "admin", status: "pending" });
    const access = await (await loadResolver())();
    expect(access.isSuperAdmin).toBe(false);
    expect(access.isStaff).toBe(false);
    expect(access.permissions.size).toBe(0);
  });

  it("an active legacy teacher keeps the teacher preset", async () => {
    CURRENT_USER = user("teacher");
    CURRENT_ROW = row({ legacyRole: "teacher", status: "active" });
    const access = await (await loadResolver())();
    expect(access.isStaff).toBe(true);
    expect(access.isLegacyAdminFallback).toBe(true);
    expect(access.permissions.has("checkin:scan")).toBe(true);
  });

  it("an active legacy admin keeps the super admin fallback", async () => {
    CURRENT_USER = user("admin");
    CURRENT_ROW = row({ legacyRole: "admin", status: "active" });
    const access = await (await loadResolver())();
    expect(access.isSuperAdmin).toBe(true);
  });
});

describe("dashboard follows resolved staff access", () => {
  async function viewFor(role: AuthUser["role"], r: StaffMember | null) {
    CURRENT_USER = user(role);
    CURRENT_ROW = r;
    const access = await (await loadResolver())();
    return resolveDashboardView(role, access);
  }

  it("disabled legacy teacher is denied the staff dashboard", async () => {
    expect(await viewFor("teacher", row({ status: "disabled" }))).toBe("no_staff_access");
  });

  it("disabled teacher grant is denied", async () => {
    expect(await viewFor("teacher", row({ roleKey: "teacher", status: "disabled" }))).toBe(
      "no_staff_access",
    );
  });

  it("disabled admin grant is denied", async () => {
    expect(await viewFor("admin", row({ roleKey: "admin", legacyRole: "admin", status: "disabled" }))).toBe(
      "no_staff_access",
    );
  });

  it("active custom grant without dashboard:view is denied", async () => {
    expect(
      await viewFor("admin", row({ roleKey: "custom", legacyRole: "admin", permissions: ["events:view"] })),
    ).toBe("no_staff_access");
  });

  it("active teacher grant is allowed", async () => {
    expect(await viewFor("teacher", row({ roleKey: "teacher" }))).toBe("staff");
  });

  it("active admin grant is allowed", async () => {
    expect(await viewFor("admin", row({ roleKey: "admin", legacyRole: "admin" }))).toBe("staff");
  });

  it("Student + Teacher keeps the student dashboard and the teacher grant", async () => {
    CURRENT_USER = user("student");
    CURRENT_ROW = row({ roleKey: "teacher", legacyRole: "student" });
    const access = await (await loadResolver())();
    expect(access.isStudent).toBe(true);
    expect(access.isStaff).toBe(true);
    expect(access.permissions.has("checkin:scan")).toBe(true);
    expect(resolveDashboardView("student", access)).toBe("student");
  });

  it("a plain student gets the student dashboard", async () => {
    expect(await viewFor("student", row({ legacyRole: "student" }))).toBe("student");
  });
});
