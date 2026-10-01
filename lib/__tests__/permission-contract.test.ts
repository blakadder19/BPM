/**
 * Permission contract: the resolved permission set is exactly what the
 * Super Admin checked, navigation and page guards agree on every staff
 * route, and the Finance dataset is reachable only with finance:view.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { StaffMember } from "@/lib/repositories/interfaces/staff-repository";
import {
  PERMISSION_KEYS,
  ROLE_PRESETS,
  type Permission,
  type StaffRoleKey,
  type StaffStatus,
} from "@/lib/domain/permissions";
import { NAVIGATION, getNavigationForAccess } from "@/lib/role-config";

const h = vi.hoisted(() => ({
  user: null as AuthUser | null,
  row: null as StaffMember | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    if (!h.user) throw new Error("REDIRECT:/login");
    return h.user;
  },
  getAuthUser: async () => h.user,
}));
vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({ getStaff: async () => h.row, listStaff: async () => [] }),
  getStudentRepo: () => ({ getAll: async () => [] }),
  getSubscriptionRepo: () => ({ getAll: async () => [] }),
  getSpecialEventRepo: () => ({ getAllEvents: async () => [], getAllPurchases: async () => [] }),
}));
vi.mock("@/lib/services/penalty-store", () => ({ getPenaltyService: () => ({ penalties: [] }) }));
vi.mock("@/lib/supabase/hydrate-operational", () => ({
  ensureOperationalDataHydrated: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/finance-audit-log", () => ({ getAuditLog: () => [] }));

const ROOT = join(__dirname, "..", "..");

function signIn(opts: {
  baseRole?: AuthUser["role"];
  roleKey: StaffRoleKey | null;
  permissions?: readonly Permission[];
  status?: StaffStatus;
}) {
  const baseRole = opts.baseRole ?? (opts.roleKey === "teacher" ? "teacher" : "admin");
  h.user = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Staff",
    role: baseRole,
    avatarUrl: null,
    academyId: "a-1",
    emailConfirmed: true,
  };
  h.row = {
    id: "u-1",
    email: "staff@example.test",
    fullName: "Staff",
    legacyRole: baseRole,
    roleKey: opts.roleKey,
    permissions: [...(opts.permissions ?? [])],
    status: opts.status ?? "active",
    invitedBy: null,
    updatedAt: null,
    createdAt: null,
  };
}

const without = (role: StaffRoleKey, ...drop: Permission[]) =>
  ROLE_PRESETS[role].filter((p) => !drop.includes(p));

async function resolver() {
  return import("@/lib/staff-permissions");
}

async function access() {
  return (await resolver()).getStaffAccess();
}

async function navHrefs() {
  const a = await access();
  return getNavigationForAccess({
    isStudent: a.isStudent,
    permissions: a.permissions,
    isSuperAdmin: a.isSuperAdmin,
  }).map((i) => i.href);
}

async function pageGuardAllows(key: Permission) {
  const { requirePermission } = await resolver();
  try {
    await requirePermission(key);
    return true;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return false;
    throw e;
  }
}

async function financeDataAllowed() {
  const { getFinanceData } = await import("@/lib/actions/finance");
  try {
    const data = await getFinanceData();
    return Array.isArray(data.transactions);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return false;
    throw e;
  }
}

beforeEach(() => {
  vi.resetModules();
  h.user = null;
  h.row = null;
});

// ── Navigation ↔ page guard agreement ─────────────────────────

/**
 * The single guard every staff route must use, in both the nav item and the
 * server page. "super_admin" = no granular permission; nav and page are
 * Super Admin only.
 */
const ROUTE_GUARDS: Record<string, Permission | Permission[] | "super_admin" | "student"> = {
  "/dashboard": "dashboard:view",
  "/classes": "classes:view",
  "/bookings": "bookings:view",
  "/events": "events:view",
  "/catalog": "student",
  "/attendance": "attendance:view",
  "/students": ["students:view", "students:view_limited"],
  "/terms": "super_admin",
  "/products": "products:view",
  "/penalties": "super_admin",
  "/finance": "finance:view",
  "/affiliations": "affiliations:view",
  "/referrals": "referrals:view",
  "/discount-rules": "discounts:view",
  "/broadcasts": "super_admin",
  "/studio-hire": "super_admin",
  "/staff": "staff:view",
  "/settings": "settings:view",
};

describe("navigation and page guards agree", () => {
  it("every nav item has a declared guard", () => {
    expect(NAVIGATION.map((n) => n.href).sort()).toEqual(Object.keys(ROUTE_GUARDS).sort());
  });

  it.each(Object.entries(ROUTE_GUARDS))("%s", (href, guard) => {
    const nav = NAVIGATION.find((n) => n.href === href)!;
    const page = readFileSync(join(ROOT, "app/(app)", href, "page.tsx"), "utf8");
    if (guard === "student") {
      expect(nav.permission).toBeUndefined();
      expect(nav.roles).toEqual(["student"]);
      expect(page).toMatch(/requireRole\(\["student"\]\)/);
      return;
    }
    if (guard === "super_admin") {
      expect(nav.permission).toBeUndefined();
      expect(page).toMatch(/requireSuperAdmin\(\)/);
      return;
    }
    const keys = Array.isArray(guard) ? guard : [guard];
    const navKeys = Array.isArray(nav.permission) ? nav.permission : [nav.permission];
    expect([...navKeys].sort()).toEqual([...keys].sort());
    if (href === "/dashboard") {
      expect(page).toMatch(/resolveDashboardView/);
      return;
    }
    if (keys.length === 1) {
      expect(page).toMatch(
        new RegExp(`(requirePermission|hasPermission)\\((access, )?"${keys[0]}"\\)`),
      );
    } else {
      expect(page).toContain(`requireAnyPermission(${JSON.stringify(keys).replace(/,/g, ", ")})`);
    }
  });
});

// ── Finance ───────────────────────────────────────────────────

describe("Finance requires finance:view only", () => {
  it("source: page, nav and data action name finance:view alone", () => {
    const page = readFileSync(join(ROOT, "app/(app)/finance/page.tsx"), "utf8");
    const action = readFileSync(join(ROOT, "lib/actions/finance.ts"), "utf8");
    expect(page).toContain('requirePermission("finance:view")');
    expect(action).toContain('requirePermission("finance:view")');
    for (const src of [page, action]) {
      expect(src).not.toMatch(/requireAnyPermission\(\[[^\]]*finance:view/);
    }
    expect(NAVIGATION.find((n) => n.href === "/finance")!.permission).toBe("finance:view");
  });

  it("Teacher defaults (finance:view not checked): no nav, page denied, data action denied", async () => {
    signIn({ roleKey: "teacher", permissions: ROLE_PRESETS.teacher });
    expect(ROLE_PRESETS.teacher).toContain("payments:view_limited");
    expect(await navHrefs()).not.toContain("/finance");
    expect(await pageGuardAllows("finance:view")).toBe(false);
    expect(await financeDataAllowed()).toBe(false);
  });

  it.each([
    ["payments:view_limited"],
    ["payments:view"],
    ["payments:mark_paid_reception"],
  ] as [Permission][])("%s alone never opens the Finance dataset", async (perm) => {
    signIn({ roleKey: "custom", permissions: ["dashboard:view", perm] });
    expect(await navHrefs()).not.toContain("/finance");
    expect(await financeDataAllowed()).toBe(false);
  });

  it("Teacher with finance:view checked opens Finance", async () => {
    signIn({ roleKey: "teacher", permissions: [...ROLE_PRESETS.teacher, "finance:view"] });
    expect(await navHrefs()).toContain("/finance");
    expect(await pageGuardAllows("finance:view")).toBe(true);
    expect(await financeDataAllowed()).toBe(true);
  });

  it("Read Only with finance:view removed is denied", async () => {
    signIn({ roleKey: "read_only", permissions: without("read_only", "finance:view") });
    expect(await navHrefs()).not.toContain("/finance");
    expect(await financeDataAllowed()).toBe(false);
  });

  it("unauthenticated callers never receive the dataset", async () => {
    expect(await financeDataAllowed()).toBe(false);
  });
});

// ── Money on non-finance pages ────────────────────────────────

describe("pages reachable without finance permissions never serialize money", () => {
  it("/students strips wallet, penalties, event purchases and subscription amounts without students:view_finance", () => {
    const page = readFileSync(join(ROOT, "app/(app)/students/page.tsx"), "utf8");
    expect(page).toContain('canViewFinance: hasPermission(access, "students:view_finance")');
    expect(page).toContain("subscriptions={canViewFinance ? subscriptions : subscriptions.map(redactSubscriptionFinance)}");
    expect(page).toContain("walletTransactions={canViewFinance ? walletTransactions : []}");
    expect(page).toContain("penalties={canViewFinance ? penalties : []}");
    expect(page).toContain("eventPurchases={canViewFinance ? eventPurchases : []}");
  });

  it("redactSubscriptionFinance leaves no amount, discount, VAT, reference or refund detail", async () => {
    const { redactSubscriptionFinance } = await import("@/lib/domain/student-finance-redaction");
    const full = {
      id: "sub-1",
      productName: "Gold",
      remainingCredits: 4,
      paymentStatus: "paid",
      paymentMethod: "cash",
      paymentReference: "REF",
      paymentNotes: "paid in cash",
      priceCentsAtPurchase: 9000,
      originalPriceCents: 10000,
      discountAmountCents: 1000,
      appliedDiscount: { x: 1 },
      manualDiscountCents: 500,
      manualDiscountReason: "friend",
      manualDiscountBy: "u-9",
      refundedAt: "2026-01-01",
      refundedBy: "Admin",
      refundReason: "moved away",
      stripeRefundId: "re_1",
      refundedAmountCents: 9000,
      refundStatus: "succeeded",
      subtotalExVatCents: 7317,
      vatAmountCents: 1683,
      vatRatePercent: 23,
      vatPriceMode: "inclusive",
      totalIncVatCents: 9000,
    } as unknown as import("@/lib/mock-data").MockSubscription;
    const r = redactSubscriptionFinance(full);
    expect(r).toMatchObject({ productName: "Gold", remainingCredits: 4, paymentStatus: "paid" });
    for (const [k, v] of Object.entries(r)) {
      if (/cents|price|amount|vat|discount|refund|reference|paymentNotes/i.test(k)) {
        expect([null, 0], k).toContain(v);
      }
    }
  });

  it("/dashboard sends penalty totals and pending payments only with finance:view", () => {
    const page = readFileSync(join(ROOT, "app/(app)/dashboard/page.tsx"), "utf8");
    expect(page).toContain('const canViewFinance = hasPermission(access, "finance:view")');
    expect(page).toMatch(/unresolvedPenaltyTotal: canViewFinance\s*\?/);
    expect(page).toMatch(/pendingEventPayments: canViewFinance\s*\?[\s\S]*?: \[\],/);
  });
});

// ── Classes tabs ──────────────────────────────────────────────

describe("Classes tabs match their page guards", () => {
  const TAB_PAGES: Record<string, string> = {
    "/classes": "app/(app)/classes/page.tsx",
    "/classes/bookable": "app/(app)/classes/bookable/page.tsx",
    "/classes/teachers": "app/(app)/classes/teachers/page.tsx",
  };

  it.each([
    ["classes:view only", ["classes:view"], ["/classes", "/classes/bookable"]],
    ["teachers:view only", ["teachers:view"], ["/classes/teachers"]],
    ["both", ["classes:view", "teachers:view"], ["/classes", "/classes/bookable", "/classes/teachers"]],
    ["neither", ["dashboard:view"], []],
  ] as [string, Permission[], string[]][])("%s", async (_label, perms, expected) => {
    const { visibleClassesTabs } = await import("@/lib/classes-tabs");
    const tabs = visibleClassesTabs("admin", { isSuperAdmin: false, permissions: new Set(perms) });
    expect(tabs.map((t) => t.href)).toEqual(expected);
    for (const t of tabs) {
      const page = readFileSync(join(ROOT, TAB_PAGES[t.href]), "utf8");
      const allowed = perms.some((p) => page.includes(`requirePermission("${p}")`));
      expect(allowed, t.href).toBe(true);
    }
  });

  it("students and Super Admins", async () => {
    const { visibleClassesTabs } = await import("@/lib/classes-tabs");
    expect(visibleClassesTabs("student", { isSuperAdmin: false, permissions: new Set(["classes:view"]) })).toEqual([]);
    expect(visibleClassesTabs("admin", { isSuperAdmin: true, permissions: new Set() })).toHaveLength(3);
  });

  it("the layout no longer decides tabs from users.role on the client", () => {
    const layout = readFileSync(join(ROOT, "app/(app)/classes/layout.tsx"), "utf8");
    expect(layout).not.toContain('"use client"');
    expect(layout).toContain("visibleClassesTabs(");
  });
});

// ── Exact permissions ─────────────────────────────────────────

describe("exact permissions — unchecked means denied", () => {
  it("Teacher preset with attendance:view unchecked: Attendance absent and denied", async () => {
    signIn({ roleKey: "teacher", permissions: without("teacher", "attendance:view") });
    expect(await navHrefs()).not.toContain("/attendance");
    expect(await pageGuardAllows("attendance:view")).toBe(false);
  });

  it("Teacher with only classes:view sees only Classes", async () => {
    signIn({ roleKey: "teacher", permissions: ["classes:view"] });
    expect(await navHrefs()).toEqual(["/classes"]);
    expect(await pageGuardAllows("classes:view")).toBe(true);
    expect(await pageGuardAllows("dashboard:view")).toBe(false);
  });

  it("Admin with settings:view unchecked cannot access Settings", async () => {
    signIn({ roleKey: "admin", permissions: without("admin", "settings:view") });
    expect(await navHrefs()).not.toContain("/settings");
    expect(await pageGuardAllows("settings:view")).toBe(false);
  });

  it("a role label never adds permissions: admin with an empty list has none", async () => {
    signIn({ roleKey: "admin", permissions: [] });
    expect((await access()).permissions.size).toBe(0);
    expect(await navHrefs()).toEqual([]);
  });

  it("custom works exactly as before", async () => {
    signIn({ roleKey: "custom", permissions: ["events:view", "classes:view"] });
    expect([...(await access()).permissions].sort()).toEqual(["classes:view", "events:view"]);
    expect((await navHrefs()).sort()).toEqual(["/classes", "/events"]);
  });

  it("resolved set equals the stored list for every preset role", async () => {
    for (const role of ["admin", "front_desk", "teacher", "read_only"] as const) {
      vi.resetModules();
      signIn({ roleKey: role, permissions: ROLE_PRESETS[role] });
      expect([...(await access()).permissions].sort()).toEqual([...ROLE_PRESETS[role]].sort());
    }
  });
});

describe("a view permission never grants another permission", () => {
  it.each(PERMISSION_KEYS.filter((k) => k.endsWith(":view") || k.endsWith(":view_limited")))(
    "holding only %s passes no other action guard",
    async (key) => {
      signIn({ roleKey: "custom", permissions: [key] });
      const { requirePermissionForAction } = await resolver();
      for (const other of PERMISSION_KEYS) {
        const res = await requirePermissionForAction(other);
        expect(res.ok).toBe(other === key);
      }
    },
  );
});

// ── Status, Super Admin, dual role ────────────────────────────

describe("status", () => {
  it.each([
    ["active", true],
    ["disabled", false],
    ["pending", false],
  ] as [StaffStatus, boolean][])("%s grant → permissions apply: %s", async (status, applies) => {
    signIn({ roleKey: "admin", permissions: ROLE_PRESETS.admin, status });
    const a = await access();
    expect(a.permissions.size > 0).toBe(applies);
    expect(a.isStaff).toBe(applies);
    expect(await pageGuardAllows("dashboard:view")).toBe(applies);
  });
});

describe("Super Admin", () => {
  it.each([[[]], [["events:view"]]] as Permission[][][])(
    "has every permission regardless of the stored list %j",
    async (stored) => {
      signIn({ roleKey: "super_admin", permissions: stored });
      const a = await access();
      expect(a.isSuperAdmin).toBe(true);
      expect(a.permissions.size).toBe(PERMISSION_KEYS.length);
      expect(await financeDataAllowed()).toBe(true);
    },
  );
});

describe("Student + Teacher", () => {
  it("keeps student navigation; staff tools follow the exact checked list", async () => {
    signIn({
      baseRole: "student",
      roleKey: "teacher",
      permissions: without("teacher", "attendance:view", "payments:view_limited"),
    });
    const a = await access();
    expect(a.isStudent).toBe(true);
    const hrefs = await navHrefs();
    expect(hrefs).toContain("/catalog");
    expect(hrefs).not.toContain("/attendance");
    expect(hrefs).not.toContain("/finance");
    expect(await financeDataAllowed()).toBe(false);
  });
});
