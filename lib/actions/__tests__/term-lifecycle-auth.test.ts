/**
 * The manual lifecycle Server Action must never grant cron authority from a
 * caller-supplied string. Uses the real staff-access resolver so the
 * student / non-super admin / super admin cases go through production logic.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";

let CURRENT_USER: AuthUser | null = null;
let CURRENT_ROW: StaffMember | null = null;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    if (!CURRENT_USER) throw new Error("REDIRECT:/login");
    return CURRENT_USER;
  },
}));
vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({ getStaff: async () => CURRENT_ROW }),
  getSubscriptionRepo: () => ({ getAll: async () => [] }),
  getTermRepo: () => ({ getAll: async () => [] }),
  getStudentRepo: () => ({ getById: async () => null }),
}));
vi.mock("@/lib/services/subscription-service", () => ({
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}));
vi.mock("@/lib/supabase/hydrate-operational", () => ({
  ensureOperationalDataHydrated: vi.fn(async () => {}),
}));
vi.mock("@/lib/communications/dispatch", () => ({ dispatchCommEvents: vi.fn() }));
vi.mock("@/lib/communications/builders", () => ({ renewalPreparedEvent: vi.fn() }));

const runTermLifecycle = vi.fn(async () => ({
  success: true as const,
  result: { expired: 1, renewalsPrepared: 0, details: ["x"] },
}));
vi.mock("@/lib/services/term-lifecycle-service", () => ({
  runTermLifecycle: () => runTermLifecycle(),
  getLastLifecycleRun: () => "2026-09-30T03:00:00.000Z",
}));

const user = (role: AuthUser["role"]): AuthUser => ({
  id: "u-1",
  email: "someone@example.test",
  fullName: "Someone",
  role,
  avatarUrl: null,
  academyId: "a-1",
  emailConfirmed: true,
});

const row = (over: Partial<StaffMember>): StaffMember => ({
  id: "u-1",
  email: "someone@example.test",
  fullName: "Someone",
  legacyRole: "student",
  roleKey: null,
  permissions: [],
  status: "active",
  invitedBy: null,
  updatedAt: null,
  createdAt: null,
  ...over,
});

async function loadAction() {
  return import("../term-lifecycle");
}

// Old call shape, kept to prove extra arguments are ignored.
type LegacyCall = (trigger?: string) => ReturnType<
  Awaited<ReturnType<typeof loadAction>>["runTermLifecycleAction"]
>;

beforeEach(() => {
  vi.resetModules();
  runTermLifecycle.mockClear();
  CURRENT_USER = null;
  CURRENT_ROW = null;
});

describe("runTermLifecycleAction authorization", () => {
  it("a student cannot trigger lifecycle with 'manual'", async () => {
    CURRENT_USER = user("student");
    CURRENT_ROW = row({});
    const { runTermLifecycleAction } = await loadAction();
    const res = await (runTermLifecycleAction as LegacyCall)("manual");
    expect(res.success).toBe(false);
    expect(runTermLifecycle).not.toHaveBeenCalled();
  });

  it("a student cannot trigger lifecycle with 'scheduled'", async () => {
    CURRENT_USER = user("student");
    CURRENT_ROW = row({});
    const { runTermLifecycleAction } = await loadAction();
    const res = await (runTermLifecycleAction as LegacyCall)("scheduled");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Super Admin/);
    expect(runTermLifecycle).not.toHaveBeenCalled();
  });

  it("an unauthenticated caller cannot trigger lifecycle with 'scheduled'", async () => {
    const { runTermLifecycleAction } = await loadAction();
    await expect((runTermLifecycleAction as LegacyCall)("scheduled")).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(runTermLifecycle).not.toHaveBeenCalled();
  });

  it("an admin without Super Admin cannot trigger lifecycle", async () => {
    CURRENT_USER = user("admin");
    CURRENT_ROW = row({ roleKey: "admin", legacyRole: "admin" });
    const { runTermLifecycleAction } = await loadAction();
    const res = await (runTermLifecycleAction as LegacyCall)("scheduled");
    expect(res.success).toBe(false);
    expect(runTermLifecycle).not.toHaveBeenCalled();
  });

  it("a disabled Super Admin grant cannot trigger lifecycle", async () => {
    CURRENT_USER = user("admin");
    CURRENT_ROW = row({ roleKey: "super_admin", status: "disabled" });
    const { runTermLifecycleAction } = await loadAction();
    const res = await runTermLifecycleAction();
    expect(res.success).toBe(false);
    expect(runTermLifecycle).not.toHaveBeenCalled();
  });

  it("a Super Admin manual run works", async () => {
    CURRENT_USER = user("admin");
    CURRENT_ROW = row({ roleKey: "super_admin", legacyRole: "admin" });
    const { runTermLifecycleAction } = await loadAction();
    const res = await runTermLifecycleAction();
    expect(res.success).toBe(true);
    expect(res.result?.expired).toBe(1);
    expect(runTermLifecycle).toHaveBeenCalledTimes(1);
  });

  it("getLifecycleRunInfo hides run metadata from non-super-admins", async () => {
    CURRENT_USER = user("student");
    CURRENT_ROW = row({});
    const { getLifecycleRunInfo } = await loadAction();
    expect(await getLifecycleRunInfo()).toEqual({ lastRun: null });
  });
});
