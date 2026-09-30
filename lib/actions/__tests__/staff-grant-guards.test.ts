/**
 * Staff grant writes must be bounded by the actor's own access: no touching
 * Super Admins without being one, no self-edits, no granting permissions the
 * actor does not hold. Uses the real staff-access resolver.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";

const h = vi.hoisted(() => ({
  currentUser: null as AuthUser | null,
  rows: new Map<string, StaffMember>(),
  updateStaff: vi.fn(),
  createInvite: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    if (!h.currentUser) throw new Error("REDIRECT:/login");
    return h.currentUser;
  },
}));
vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({
    getStaff: async (id: string) => h.rows.get(id) ?? null,
    getStaffByEmail: async (email: string) =>
      [...h.rows.values()].find((r) => r.email === email) ?? null,
    listStaff: async () => [...h.rows.values()],
    updateStaff: h.updateStaff,
    createInvite: h.createInvite,
  }),
}));
vi.mock("@/lib/communications/staff-invite-email", () => ({
  sendStaffInviteEmail: async () => ({ status: "skipped" }),
}));

const ACTOR_ID = "actor-1";
const TARGET_ID = "target-1";
const SUPER_ID = "super-1";

const row = (over: Partial<StaffMember> & { id: string }): StaffMember => ({
  email: `${over.id}@example.test`,
  fullName: over.id,
  legacyRole: "student",
  roleKey: null,
  permissions: [],
  status: "active",
  invitedBy: null,
  updatedAt: null,
  createdAt: null,
  ...over,
});

function signIn(r: StaffMember) {
  h.rows.set(r.id, r);
  h.currentUser = {
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    role: r.legacyRole === "student" ? "student" : "admin",
    avatarUrl: null,
    academyId: "a-1",
    emailConfirmed: true,
  };
}

/** A delegated staff manager: can manage staff but holds few permissions. */
const staffManager = () =>
  row({
    id: ACTOR_ID,
    legacyRole: "admin",
    roleKey: "custom",
    permissions: [
      "dashboard:view",
      "staff:view",
      "staff:invite",
      "staff:edit_permissions",
      "staff:disable",
    ],
  });

const superAdmin = (id = SUPER_ID) =>
  row({ id, legacyRole: "admin", roleKey: "super_admin" });

async function load() {
  return import("../staff");
}

beforeEach(() => {
  vi.resetModules();
  h.currentUser = null;
  h.rows.clear();
  h.updateStaff.mockReset();
  h.createInvite.mockReset();
  h.createInvite.mockResolvedValue({
    id: "inv-1",
    token: "tok",
    expiresAt: "2026-10-07T00:00:00.000Z",
  });
});

describe("inviteStaffAction — existing-account grant", () => {
  it("a non-super-admin cannot grant a preset with permissions they lack", async () => {
    signIn(staffManager());
    h.rows.set(TARGET_ID, row({ id: TARGET_ID }));
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${TARGET_ID}@example.test`,
      roleKey: "admin",
      permissions: [],
    });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("a non-super-admin cannot add extra permissions beyond their own", async () => {
    signIn(staffManager());
    h.rows.set(TARGET_ID, row({ id: TARGET_ID }));
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${TARGET_ID}@example.test`,
      roleKey: "custom",
      permissions: ["dashboard:view", "finance:refund"],
    });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("a non-super-admin can grant within their own permissions", async () => {
    signIn(staffManager());
    h.rows.set(TARGET_ID, row({ id: TARGET_ID }));
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${TARGET_ID}@example.test`,
      roleKey: "custom",
      permissions: ["dashboard:view"],
    });
    expect(res.success).toBe(true);
    expect(h.updateStaff).toHaveBeenCalledWith(TARGET_ID, expect.objectContaining({ status: "active" }));
  });

  it("a non-super-admin cannot demote a Super Admin by re-inviting their email", async () => {
    signIn(staffManager());
    h.rows.set(SUPER_ID, superAdmin());
    h.rows.set("super-2", superAdmin("super-2"));
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${SUPER_ID}@example.test`,
      roleKey: "custom",
      permissions: ["dashboard:view"],
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/Super Admin/);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("a non-super-admin cannot re-invite themselves to change their own grant", async () => {
    signIn(staffManager());
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${ACTOR_ID}@example.test`,
      roleKey: "custom",
      permissions: ["dashboard:view"],
    });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("the last Super Admin cannot be demoted through the invite path", async () => {
    // Legacy-fallback super admin (no staff_role_key), so the target is the
    // only counted active Super Admin.
    signIn(row({ id: ACTOR_ID, legacyRole: "admin", roleKey: null }));
    h.rows.set(SUPER_ID, superAdmin());
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${SUPER_ID}@example.test`,
      roleKey: "teacher",
      permissions: [],
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/last active Super Admin/);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("a Super Admin cannot demote themselves through the invite path", async () => {
    signIn(superAdmin(SUPER_ID));
    h.rows.set("super-2", superAdmin("super-2"));
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${SUPER_ID}@example.test`,
      roleKey: "teacher",
      permissions: [],
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/your own Super Admin/);
  });

  it("a Super Admin can grant admin to an existing student, who keeps the student role", async () => {
    signIn(superAdmin());
    h.rows.set(TARGET_ID, row({ id: TARGET_ID }));
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: `${TARGET_ID}@example.test`,
      roleKey: "admin",
      permissions: [],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data?.keepsStudentAccess).toBe(true);
    expect(h.updateStaff).toHaveBeenCalledTimes(1);
  });
});

describe("inviteStaffAction — new email", () => {
  it("a non-super-admin cannot create an invite beyond their own permissions", async () => {
    signIn(staffManager());
    const { inviteStaffAction } = await load();
    const res = await inviteStaffAction({
      email: "newcomer@example.test",
      roleKey: "front_desk",
      permissions: [],
    });
    expect(res.success).toBe(false);
    expect(h.createInvite).not.toHaveBeenCalled();
  });
});

describe("updateStaffPermissionsAction", () => {
  it("a non-super-admin cannot edit their own grant", async () => {
    signIn(staffManager());
    const { updateStaffPermissionsAction } = await load();
    const res = await updateStaffPermissionsAction({
      userId: ACTOR_ID,
      roleKey: "custom",
      permissions: ["dashboard:view", "staff:view"],
    });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("a non-super-admin cannot raise another grant above their own", async () => {
    signIn(staffManager());
    h.rows.set(TARGET_ID, row({ id: TARGET_ID, roleKey: "custom", permissions: ["dashboard:view"] }));
    const { updateStaffPermissionsAction } = await load();
    const res = await updateStaffPermissionsAction({
      userId: TARGET_ID,
      roleKey: "admin",
      permissions: [],
    });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });
});

describe("setStaffStatusAction / updateStaffProfileAction", () => {
  it("a non-super-admin cannot reactivate a disabled Super Admin", async () => {
    signIn(staffManager());
    h.rows.set(SUPER_ID, { ...superAdmin(), status: "disabled" });
    const { setStaffStatusAction } = await load();
    const res = await setStaffStatusAction({ userId: SUPER_ID, status: "active" });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("a non-super-admin cannot activate a grant broader than their own", async () => {
    signIn(staffManager());
    h.rows.set(TARGET_ID, row({ id: TARGET_ID, roleKey: "admin", status: "pending" }));
    const { setStaffStatusAction } = await load();
    const res = await setStaffStatusAction({ userId: TARGET_ID, status: "active" });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });

  it("a non-super-admin can still disable an ordinary staff member", async () => {
    signIn(staffManager());
    h.rows.set(TARGET_ID, row({ id: TARGET_ID, roleKey: "admin" }));
    const { setStaffStatusAction } = await load();
    const res = await setStaffStatusAction({ userId: TARGET_ID, status: "disabled" });
    expect(res.success).toBe(true);
    expect(h.updateStaff).toHaveBeenCalledWith(TARGET_ID, { status: "disabled" });
  });

  it("a non-super-admin cannot rename a Super Admin", async () => {
    signIn(staffManager());
    h.rows.set(SUPER_ID, superAdmin());
    const { updateStaffProfileAction } = await load();
    const res = await updateStaffProfileAction({ userId: SUPER_ID, fullName: "Renamed" });
    expect(res.success).toBe(false);
    expect(h.updateStaff).not.toHaveBeenCalled();
  });
});
