/**
 * Staff invites can only be accepted by the account they were issued to.
 * Identity comes from verified auth; the email is re-checked against
 * auth.users, so neither a caller-chosen userId nor a caller-chosen email
 * can claim someone else's invite.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StaffRoleKey } from "@/lib/domain/permissions";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/data-provider", () => ({ isMemoryMode: () => false }));

interface FakeInvite {
  id: string;
  email: string;
  roleKey: StaffRoleKey;
  permissions: string[];
  status: "pending" | "accepted" | "revoked";
  expiresAt: string | null;
  token: string;
  displayName: string | null;
}

// auth.users as Supabase Auth sees it.
const AUTH_USERS = new Map<string, { email: string; email_confirmed_at: string | null }>();
let INVITES: FakeInvite[] = [];
const STAFF_ROWS = new Map<string, { roleKey: StaffRoleKey | null; legacyRole: string }>();
const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
const accepted: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = AUTH_USERS.get(id);
          return u
            ? { data: { user: { id, ...u } }, error: null }
            : { data: { user: null }, error: { message: "User not found" } };
        },
      },
    },
  }),
}));

vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({
    async getPendingInviteByEmail(email: string) {
      return (
        INVITES.find(
          (i) => i.status === "pending" && i.email.trim().toLowerCase() === email,
        ) ?? null
      );
    },
    async getInviteByToken(token: string) {
      return INVITES.find((i) => i.token === token) ?? null;
    },
    async getStaff(id: string) {
      const r = STAFF_ROWS.get(id);
      return r ? { id, ...r, permissions: [], status: "active" } : null;
    },
    async updateStaff(id: string, patch: Record<string, unknown>) {
      updateCalls.push({ id, patch });
    },
    async markInviteAccepted(id: string) {
      accepted.push(id);
      const inv = INVITES.find((i) => i.id === id);
      if (inv) inv.status = "accepted";
    },
  }),
}));

let CURRENT_USER: { id: string; email: string } | null = null;
vi.mock("@/lib/auth", () => ({ getAuthUser: async () => CURRENT_USER }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { acceptPendingStaffInviteForUser } from "@/lib/staff-invite-acceptance";
import { acceptStaffInviteByTokenAction } from "@/lib/actions/staff-invite-accept";

const VICTIM = { id: "user-victim", email: "invitee@example.test" };
const ATTACKER = { id: "user-attacker", email: "attacker@example.test" };

function invite(over: Partial<FakeInvite> = {}): FakeInvite {
  return {
    id: "inv-1",
    email: VICTIM.email,
    roleKey: "teacher",
    permissions: [],
    status: "pending",
    expiresAt: null,
    token: "tok_invite",
    displayName: null,
    ...over,
  };
}

beforeEach(() => {
  AUTH_USERS.clear();
  AUTH_USERS.set(VICTIM.id, { email: VICTIM.email, email_confirmed_at: "2026-09-01T00:00:00Z" });
  AUTH_USERS.set(ATTACKER.id, { email: ATTACKER.email, email_confirmed_at: "2026-09-01T00:00:00Z" });
  INVITES = [invite()];
  STAFF_ROWS.clear();
  updateCalls.length = 0;
  accepted.length = 0;
  CURRENT_USER = null;
});

describe("acceptPendingStaffInviteForUser identity checks", () => {
  it("a caller cannot accept an invite for another userId", async () => {
    // Attacker passes the victim's email with their own id.
    const r = await acceptPendingStaffInviteForUser({ userId: ATTACKER.id, email: VICTIM.email });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("email_unverified");
    expect(updateCalls).toHaveLength(0);
    expect(accepted).toHaveLength(0);
  });

  it("a caller cannot override their email", async () => {
    const r = await acceptPendingStaffInviteForUser({ userId: ATTACKER.id, email: "INVITEE@example.test" });
    expect(r.applied).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it("an unconfirmed auth email cannot accept", async () => {
    AUTH_USERS.set(VICTIM.id, { email: VICTIM.email, email_confirmed_at: null });
    const r = await acceptPendingStaffInviteForUser({ userId: VICTIM.id, email: VICTIM.email });
    expect(r.reason).toBe("email_unverified");
    expect(updateCalls).toHaveLength(0);
  });

  it("an unknown userId cannot accept", async () => {
    const r = await acceptPendingStaffInviteForUser({ userId: "user-ghost", email: VICTIM.email });
    expect(r.applied).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it("an expired invite is rejected", async () => {
    INVITES = [invite({ expiresAt: "2020-01-01T00:00:00Z" })];
    const r = await acceptPendingStaffInviteForUser({ userId: VICTIM.id, email: VICTIM.email });
    expect(r.reason).toBe("expired");
    expect(updateCalls).toHaveLength(0);
  });

  it("a revoked invite is rejected", async () => {
    INVITES = [invite({ status: "revoked" })];
    const r = await acceptPendingStaffInviteForUser({ userId: VICTIM.id, email: VICTIM.email });
    expect(r.reason).toBe("no_invite");
    expect(updateCalls).toHaveLength(0);
  });

  it("the legitimate invitee is accepted (email matched case-insensitively)", async () => {
    const r = await acceptPendingStaffInviteForUser({ userId: VICTIM.id, email: "Invitee@Example.TEST" });
    expect(r.applied).toBe(true);
    expect(updateCalls).toEqual([
      { id: VICTIM.id, patch: { roleKey: "teacher", permissions: [], status: "active" } },
    ]);
    expect(accepted).toEqual(["inv-1"]);
  });

  it("an existing student gets the staff grant and keeps the student role", async () => {
    STAFF_ROWS.set(VICTIM.id, { roleKey: null, legacyRole: "student" });
    const r = await acceptPendingStaffInviteForUser({ userId: VICTIM.id, email: VICTIM.email });
    expect(r.applied).toBe(true);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    expect(patch).toMatchObject({ roleKey: "teacher", status: "active" });
    // The base role is never written, so Student + Teacher both survive.
    expect(patch).not.toHaveProperty("role");
    expect(patch).not.toHaveProperty("legacyRole");
  });
});

describe("acceptStaffInviteByTokenAction end to end", () => {
  it("identity comes from verified auth, not from extra arguments", async () => {
    CURRENT_USER = ATTACKER;
    const call = acceptStaffInviteByTokenAction as unknown as (
      token: string,
      spoof: { userId: string; email: string },
    ) => ReturnType<typeof acceptStaffInviteByTokenAction>;
    const r = await call("tok_invite", { userId: VICTIM.id, email: VICTIM.email });
    expect(r.outcome).toBe("email_mismatch");
    expect(updateCalls).toHaveLength(0);
  });

  it("the invited account accepts", async () => {
    CURRENT_USER = VICTIM;
    const r = await acceptStaffInviteByTokenAction("tok_invite");
    expect(r.outcome).toBe("accepted");
    expect(updateCalls[0]?.id).toBe(VICTIM.id);
  });

  it("an unconfirmed email is told to confirm first", async () => {
    AUTH_USERS.set(VICTIM.id, { email: VICTIM.email, email_confirmed_at: null });
    CURRENT_USER = VICTIM;
    const r = await acceptStaffInviteByTokenAction("tok_invite");
    expect(r.outcome).toBe("error");
    expect(r.message).toMatch(/Confirm your email/);
    expect(updateCalls).toHaveLength(0);
  });
});

describe("no Server Action accepts an invite from caller-supplied identity", () => {
  it("acceptStaffInviteOnSignInAction no longer exists", () => {
    const src = readFileSync(join(process.cwd(), "lib/actions/staff.ts"), "utf8");
    expect(src).not.toMatch(/export\s+async\s+function\s+acceptStaffInviteOnSignInAction/);
  });
});
