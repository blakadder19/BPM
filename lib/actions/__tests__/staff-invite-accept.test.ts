/**
 * Phase 18 — token-based staff invite acceptance.
 *
 * Locks down the failure modes the previous `/login?invite=<token>`
 * arrangement could not express, because the token was never read:
 * an already-signed-in recipient was bounced to /dashboard and their
 * invite silently stayed pending forever.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { StaffRoleKey } from "@/lib/domain/permissions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

let INVITES: FakeInvite[] = [];
let CURRENT_USER: { id: string; email: string } | null = null;
let ACCEPT_RESULT: { applied: boolean; reason: string; roleKey?: StaffRoleKey } = {
  applied: true,
  reason: "applied",
  roleKey: "teacher",
};
const acceptCalls: Array<{ userId: string; email: string | null | undefined }> = [];

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => CURRENT_USER),
}));

vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({
    async getInviteByToken(token: string) {
      return INVITES.find((i) => i.token === token) ?? null;
    },
  }),
}));

vi.mock("@/lib/staff-invite-acceptance", () => ({
  acceptPendingStaffInviteForUser: vi.fn(async (input: { userId: string; email: string | null }) => {
    acceptCalls.push(input);
    return ACCEPT_RESULT;
  }),
}));

import { acceptStaffInviteByTokenAction } from "../staff-invite-accept";

function invite(over: Partial<FakeInvite> = {}): FakeInvite {
  return {
    id: "inv-1",
    email: "guille@example.com",
    roleKey: "teacher",
    permissions: [],
    status: "pending",
    expiresAt: null,
    token: "tok_abc123",
    displayName: "Guille",
    ...over,
  };
}

beforeEach(() => {
  INVITES = [invite()];
  CURRENT_USER = { id: "u-1", email: "guille@example.com" };
  ACCEPT_RESULT = { applied: true, reason: "applied", roleKey: "teacher" };
  acceptCalls.length = 0;
});

// ── Happy path ───────────────────────────────────────────────

describe("logged-in acceptance", () => {
  it("accepts when the signed-in email matches the invite", async () => {
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("accepted");
    expect(r.message).toMatch(/Teacher access is now active/i);
    expect(r.roleKey).toBe("teacher");
    expect(acceptCalls).toEqual([{ userId: "u-1", email: "guille@example.com" }]);
  });

  it("matches the email case-insensitively", async () => {
    CURRENT_USER = { id: "u-1", email: "GUILLE@Example.COM" };
    INVITES = [invite({ email: "guille@example.com" })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("accepted");
  });

  it("tolerates surrounding whitespace on the invited email", async () => {
    INVITES = [invite({ email: "  guille@example.com  " })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("accepted");
  });
});

// ── Idempotency ──────────────────────────────────────────────

describe("idempotency", () => {
  it("re-opening an accepted invite is reassuring, not an error", async () => {
    INVITES = [invite({ status: "accepted" })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("already_accepted");
    expect(r.message).toMatch(/already been accepted/i);
    // No write attempted.
    expect(acceptCalls).toHaveLength(0);
  });

  it("treats a raced 'no_invite' result as already accepted", async () => {
    // Invite still reads pending, but provisioning consumed it a
    // moment earlier during sign-in.
    ACCEPT_RESULT = { applied: false, reason: "no_invite" };
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("already_accepted");
    expect(r.message).toMatch(/already active/i);
  });

  it("a second call after success is safe", async () => {
    await acceptStaffInviteByTokenAction("tok_abc123");
    INVITES = [invite({ status: "accepted" })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("already_accepted");
  });
});

// ── Rejections ───────────────────────────────────────────────

describe("expired invite", () => {
  it("is rejected with a clear message", async () => {
    INVITES = [invite({ expiresAt: "2020-01-01T00:00:00.000Z" })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("expired");
    expect(r.message).toMatch(/expired/i);
    expect(acceptCalls).toHaveLength(0);
  });

  it("a future expiry is fine", async () => {
    INVITES = [invite({ expiresAt: "2099-01-01T00:00:00.000Z" })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("accepted");
  });
});

describe("wrong account", () => {
  it("refuses when the signed-in email differs from the invited email", async () => {
    CURRENT_USER = { id: "u-2", email: "someone.else@example.com" };
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("email_mismatch");
    // Names both addresses so the user knows which to use.
    expect(r.message).toContain("guille@example.com");
    expect(r.message).toContain("someone.else@example.com");
    expect(acceptCalls).toHaveLength(0);
  });

  it("the token alone is NOT a bearer credential", async () => {
    // Someone forwarded the link to a colleague.
    CURRENT_USER = { id: "u-99", email: "attacker@example.com" };
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("email_mismatch");
    expect(acceptCalls).toHaveLength(0);
  });

  it("refuses an authenticated user with no email", async () => {
    CURRENT_USER = { id: "u-1", email: "" };
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("email_mismatch");
  });
});

describe("revoked invite", () => {
  it("is rejected and tells the user to ask for a new one", async () => {
    INVITES = [invite({ status: "revoked" })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("revoked");
    expect(r.message).toMatch(/cancelled/i);
    expect(acceptCalls).toHaveLength(0);
  });
});

describe("unknown token", () => {
  it.each(["", "   ", "tok_does_not_exist"])("rejects %p", async (tok) => {
    const r = await acceptStaffInviteByTokenAction(tok);
    expect(r.outcome).toBe("not_found");
    expect(acceptCalls).toHaveLength(0);
  });
});

// ── Logged out ───────────────────────────────────────────────

describe("logged out", () => {
  it("asks the visitor to sign in as the invited email", async () => {
    CURRENT_USER = null;
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("not_authenticated");
    expect(r.message).toContain("guille@example.com");
    expect(r.roleLabel).toBe("Teacher");
    expect(acceptCalls).toHaveLength(0);
  });

  it("still reports a dead link WITHOUT forcing a pointless sign-in", async () => {
    CURRENT_USER = null;
    INVITES = [invite({ status: "revoked" })];
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("revoked");
  });
});

// ── Downgrade protection ────────────────────────────────────

describe("downgrade protection", () => {
  it("does not downgrade an existing super admin", async () => {
    ACCEPT_RESULT = { applied: false, reason: "already_super_admin" };
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("already_super_admin");
    expect(r.message).toMatch(/already have Super Admin/i);
  });
});

describe("unexpected failure", () => {
  it("surfaces a safe message", async () => {
    ACCEPT_RESULT = { applied: false, reason: "error" };
    const r = await acceptStaffInviteByTokenAction("tok_abc123");
    expect(r.outcome).toBe("error");
    expect(r.message).toMatch(/contact your administrator/i);
  });
});
