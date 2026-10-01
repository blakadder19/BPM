import { describe, expect, it, beforeEach, vi } from "vitest";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";

// End-to-end through the real getAuthUser → getStaffAccess chain; only
// Supabase (session, token verification, DB) and the staff repo are faked.

const SUPABASE_URL = "https://proj.supabase.co";
const auth = {
  getSession: vi.fn(),
  getClaims: vi.fn(),
};
let cookieJar: Record<string, string> = {};
let dbRow: Record<string, unknown> | null = null;
let dbThrows = false;
let staffRow: StaffMember | null = null;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in cookieJar ? { name, value: cookieJar[name] } : undefined),
  }),
}));

vi.mock("@/lib/config/data-provider", () => ({ isMemoryMode: () => false }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ auth }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (dbThrows) throw new Error("db down");
            return { data: dbRow, error: null };
          },
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({ getStaff: async () => staffRow }),
}));

import { getAuthUser, requireAuth } from "@/lib/auth";
import { getStaffAccess, requirePermission, requireSuperAdmin } from "@/lib/staff-permissions";

const now = () => Math.floor(Date.now() / 1000);
const header = { alg: "ES256", kid: "kid-a", typ: "JWT" };
const verifiedClaims = (overrides: Record<string, unknown> = {}) => ({
  iss: `${SUPABASE_URL}/auth/v1`,
  sub: "user-1",
  aud: "authenticated",
  role: "authenticated",
  exp: now() + 3600,
  iat: now(),
  email: "person@example.com",
  user_metadata: { role: "admin", full_name: "Person" },
  ...overrides,
});

const dbUser = (role: "student" | "teacher" | "admin") => ({
  id: "user-1",
  email: "person@example.com",
  full_name: "Person",
  role,
  avatar_url: null,
  academy_id: "academy-1",
});

const grant = (overrides: Partial<StaffMember>): StaffMember => ({
  id: "user-1",
  email: "person@example.com",
  fullName: "Person",
  legacyRole: "admin",
  roleKey: null,
  permissions: [],
  status: "active",
  invitedBy: null,
  updatedAt: null,
  createdAt: null,
  ...overrides,
});

const setMetadataRole = (role: string) => {
  auth.getClaims.mockResolvedValue({
    data: { claims: verifiedClaims({ user_metadata: { role } }), header, signature: new Uint8Array() },
    error: null,
  });
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  cookieJar = {};
  dbRow = null;
  dbThrows = false;
  staffRow = null;
  auth.getSession.mockReset().mockResolvedValue({
    data: {
      session: {
        user: {
          id: "user-1",
          email: "person@example.com",
          email_confirmed_at: "2026-09-30T00:00:00Z",
          user_metadata: { role: "admin" },
        },
      },
    },
    error: null,
  });
  auth.getClaims.mockReset();
  setMetadataRole("admin");
});

describe("getAuthUser — verification fails closed", () => {
  it("forged/tampered session cookie (signature rejected) → no user, protected access redirects to /login", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: new Error("Invalid JWT signature") });
    dbRow = dbUser("admin");

    expect(await getAuthUser()).toBeNull();
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/login");
    await expect(requirePermission("finance:view" as never)).rejects.toThrow("REDIRECT:/login");
  });

  it("expired token → no user", async () => {
    auth.getClaims.mockResolvedValue({
      data: { claims: verifiedClaims({ exp: now() - 10 }), header, signature: new Uint8Array() },
      error: null,
    });
    dbRow = dbUser("admin");

    expect(await getAuthUser()).toBeNull();
  });

  it("auth validation unavailable (JWKS/Auth unreachable) → protected and admin access fail closed", async () => {
    auth.getClaims.mockRejectedValue(new TypeError("fetch failed"));
    dbRow = dbUser("admin");
    staffRow = grant({ roleKey: "super_admin" });

    expect(await getAuthUser()).toBeNull();
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/login");
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/login");
  });

  it("identity comes from the verified token, never from the cookie's user object", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "someone-else", email_confirmed_at: "2026-09-30T00:00:00Z" } } },
      error: null,
    });
    dbRow = dbUser("student");

    const user = await getAuthUser();
    expect(user).toMatchObject({ id: "user-1", role: "student", emailConfirmed: false });
  });

  it("ignores a client-set bpm_fresh_jwt cookie and still reads public.users", async () => {
    cookieJar = { bpm_fresh_jwt: "1" };
    dbRow = dbUser("student");

    expect(await getAuthUser()).toMatchObject({ role: "student" });
  });
});

describe("getAuthUser — role and academy only from public.users", () => {
  it("DB student + metadata admin → student, no staff permissions, super-admin pages refused", async () => {
    setMetadataRole("admin");
    dbRow = dbUser("student");

    expect(await getAuthUser()).toMatchObject({ role: "student", academyId: "academy-1" });
    const access = await getStaffAccess();
    expect(access).toMatchObject({ isStaff: false, isSuperAdmin: false });
    expect(access.permissions.size).toBe(0);
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("DB admin + metadata student → admin (legacy super admin)", async () => {
    setMetadataRole("student");
    dbRow = dbUser("admin");

    expect(await getAuthUser()).toMatchObject({ role: "admin" });
    expect(await getStaffAccess()).toMatchObject({ isSuperAdmin: true });
  });

  it.each([
    ["there is no public.users row", false],
    ["public.users is unreachable", true],
  ])("falls back to a student with no academy when %s, whatever the metadata says", async (_label, throws) => {
    setMetadataRole("admin");
    dbThrows = throws;
    auth.getClaims.mockResolvedValue({
      data: {
        claims: verifiedClaims({ user_metadata: { role: "admin", academy_id: "attacker-academy" } }),
        header,
        signature: new Uint8Array(),
      },
      error: null,
    });

    const user = await getAuthUser();
    expect(user).toMatchObject({ id: "user-1", role: "student", academyId: "" });
    expect((await getStaffAccess()).isStaff).toBe(false);
  });
});

describe("staff access still works for legitimate staff", () => {
  it("Super Admin: active super_admin grant → every permission", async () => {
    dbRow = dbUser("admin");
    staffRow = grant({ roleKey: "super_admin" });

    const access = await requireSuperAdmin();
    expect(access.isSuperAdmin).toBe(true);
  });

  it("Student + Teacher dual role: DB student with an active teacher grant keeps both", async () => {
    setMetadataRole("student");
    dbRow = dbUser("student");
    staffRow = grant({ roleKey: "teacher", legacyRole: "teacher", permissions: ["checkin:scan"] });

    const access = await getStaffAccess();
    expect(access).toMatchObject({ isStudent: true, isStaff: true, roleKey: "teacher", isSuperAdmin: false });
    expect([...access.permissions]).toEqual(["checkin:scan"]);
  });

  it("an invite-granted role (active staff_role_key) applies to a student account", async () => {
    dbRow = dbUser("student");
    staffRow = grant({ roleKey: "admin", status: "active" });

    const access = await getStaffAccess();
    expect(access).toMatchObject({ isStaff: true, roleKey: "admin", isStudent: true });
  });

  it("a pending (not yet accepted) grant confers nothing", async () => {
    dbRow = dbUser("student");
    staffRow = grant({ roleKey: "admin", status: "pending" });

    expect(await getStaffAccess()).toMatchObject({ isStaff: false });
  });
});
