import { describe, expect, it, beforeEach, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const upserts: { table: string; row: Record<string, unknown> }[] = [];
const orders: { table: string; column: string; ascending?: boolean }[] = [];
let existingUser: { id: string; role: string } | null = null;
const acceptInvite = vi.fn();

function builder(table: string) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    is: () => b,
    limit: () => b,
    update: () => b,
    order: (column: string, opts?: { ascending?: boolean }) => {
      orders.push({ table, column, ascending: opts?.ascending });
      return b;
    },
    maybeSingle: async () => {
      if (table === "users") return { data: existingUser, error: null };
      if (table === "academies") return { data: { id: "canonical-academy" }, error: null };
      return { data: null, error: null };
    },
    upsert: async (row: Record<string, unknown>) => {
      upserts.push({ table, row });
      return { error: null };
    },
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  });
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

vi.mock("@/lib/staff-invite-acceptance", () => ({
  acceptPendingStaffInviteForUser: (input: unknown) => acceptInvite(input),
}));

import { ensureSupabaseProfile } from "@/lib/auth-provisioning";

const authUser = (metadata: Record<string, unknown>) =>
  ({
    id: "new-user",
    email: "New@Example.com",
    user_metadata: metadata,
  }) as unknown as User;

const usersRow = () => upserts.find((u) => u.table === "users")?.row;

beforeEach(() => {
  upserts.length = 0;
  orders.length = 0;
  existingUser = null;
  acceptInvite.mockReset().mockResolvedValue({ applied: false, reason: "no_invite" });
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("ensureSupabaseProfile — signup metadata is not authoritative", () => {
  it.each(["admin", "teacher"])("metadata role=%s → database role student", async (role) => {
    const res = await ensureSupabaseProfile(authUser({ role, full_name: "New Person" }));

    expect(res.success).toBe(true);
    expect(usersRow()).toMatchObject({ role: "student", full_name: "New Person" });
    expect(upserts.some((u) => u.table === "student_profiles")).toBe(true);
  });

  it("metadata academy_id cannot select an academy: the canonical (oldest) academy is used", async () => {
    await ensureSupabaseProfile(authUser({ academy_id: "attacker-academy" }));

    expect(usersRow()).toMatchObject({ academy_id: "canonical-academy" });
    expect(orders).toContainEqual({ table: "academies", column: "created_at", ascending: true });
  });

  it("staff fields in metadata are ignored", async () => {
    await ensureSupabaseProfile(
      authUser({ staff_role_key: "super_admin", staff_status: "active", staff_permissions: ["*"], is_admin: true }),
    );

    const row = usersRow()!;
    expect(row.role).toBe("student");
    expect(Object.keys(row).sort()).toEqual(["academy_id", "email", "full_name", "id", "phone", "role"]);
  });

  it("an existing account (claim) keeps its role: no users upsert at all", async () => {
    existingUser = { id: "new-user", role: "student" };

    await ensureSupabaseProfile(authUser({ role: "admin" }));

    expect(usersRow()).toBeUndefined();
  });
});

describe("ensureSupabaseProfile — legitimate staff invite flow", () => {
  it("applies a pending invite for the verified email, on top of the student base role", async () => {
    acceptInvite.mockResolvedValue({ applied: true, roleKey: "teacher" });

    const res = await ensureSupabaseProfile(authUser({ role: "student" }));

    expect(res).toMatchObject({ success: true, inviteApplied: true });
    expect(acceptInvite).toHaveBeenCalledWith({ userId: "new-user", email: "New@Example.com" });
    expect(usersRow()).toMatchObject({ role: "student" });
  });
});
