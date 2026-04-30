import { describe, expect, it, vi } from "vitest";
import type { Permission } from "@/lib/domain/permissions";
import type { AuthUser } from "@/lib/auth";

// Mirror the resolver test mocks so the module graph never reaches
// `server-only`. We don't need a real DB/auth — these tests only
// exercise the pure boolean derivation helpers.
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => {
    throw new Error("requireAuth should not be called in UI permission tests");
  },
}));

vi.mock("@/lib/repositories", () => ({
  getStaffRepo: () => ({
    getStaff: async () => null,
  }),
}));

const { hasPermission, hasAnyPermission } = await import("@/lib/staff-permissions");
type StaffAccess = Awaited<ReturnType<typeof import("@/lib/staff-permissions").getStaffAccess>>;

const u = (overrides: Partial<AuthUser> = {}): AuthUser =>
  ({
    id: "user-1",
    email: "u@example.com",
    fullName: "U",
    role: "admin",
    emailConfirmed: true,
    ...overrides,
  }) as AuthUser;

const access = (
  permissions: Permission[],
  isSuperAdmin = false,
): StaffAccess => ({
  user: u(),
  isSuperAdmin,
  roleKey: isSuperAdmin ? "super_admin" : "custom",
  status: "active",
  permissions: new Set(permissions),
  isLegacyAdminFallback: false,
});

/**
 * These tests pin down the boolean derivation that all server pages
 * use to gate UI actions. Server actions still enforce these checks
 * independently — these flags only control visibility.
 */
describe("UI permission booleans for module pages", () => {
  it("super admin receives every action flag", () => {
    const a = access([], true);
    const events = {
      canCreate: hasPermission(a, "events:create"),
      canEdit: hasPermission(a, "events:edit"),
      canDelete: hasPermission(a, "events:delete"),
      canMarkPaid: hasPermission(a, "events:mark_paid"),
    };
    expect(events).toEqual({
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canMarkPaid: true,
    });
  });

  it("events:view only grants no mutation flags", () => {
    const a = access(["events:view"]);
    const events = {
      canCreate: hasPermission(a, "events:create"),
      canEdit: hasPermission(a, "events:edit"),
      canDelete: hasPermission(a, "events:delete"),
      canMarkPaid: hasPermission(a, "events:mark_paid"),
    };
    expect(events).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canMarkPaid: false,
    });
  });

  it("events:view + events:create yields create only", () => {
    const a = access(["events:view", "events:create"]);
    const events = {
      canCreate: hasPermission(a, "events:create"),
      canEdit: hasPermission(a, "events:edit"),
      canDelete: hasPermission(a, "events:delete"),
      canMarkPaid: hasPermission(a, "events:mark_paid"),
    };
    expect(events.canCreate).toBe(true);
    expect(events.canEdit).toBe(false);
    expect(events.canDelete).toBe(false);
    expect(events.canMarkPaid).toBe(false);
  });

  it("events:view + events:edit yields edit only", () => {
    const a = access(["events:view", "events:edit"]);
    expect(hasPermission(a, "events:edit")).toBe(true);
    expect(hasPermission(a, "events:delete")).toBe(false);
    expect(hasPermission(a, "events:mark_paid")).toBe(false);
  });

  it("finance combines refund permissions via hasAnyPermission", () => {
    const a = access(["finance:mark_paid"]);
    const finance = {
      canMarkPaid: hasAnyPermission(a, [
        "finance:mark_paid",
        "payments:mark_paid_reception",
      ]),
      canRefund: hasAnyPermission(a, ["finance:refund", "payments:refund"]),
      canDangerZone: hasPermission(a, "finance:danger_zone"),
    };
    expect(finance.canMarkPaid).toBe(true);
    expect(finance.canRefund).toBe(false);
    expect(finance.canDangerZone).toBe(false);
  });

  it("read-only user (only :view perms) has no create/edit/delete flags", () => {
    const a = access([
      "events:view",
      "products:view",
      "students:view",
      "bookings:view",
      "attendance:view",
      "classes:view",
      "finance:view",
      "discounts:view",
      "affiliations:view",
    ]);
    const flags = {
      events: {
        canCreate: hasPermission(a, "events:create"),
        canEdit: hasPermission(a, "events:edit"),
        canDelete: hasPermission(a, "events:delete"),
      },
      products: {
        canCreate: hasPermission(a, "products:create"),
        canEdit: hasPermission(a, "products:edit"),
        canDelete: hasPermission(a, "products:delete"),
      },
      bookings: {
        canCreate: hasPermission(a, "bookings:create"),
        canCancel: hasPermission(a, "bookings:cancel"),
        canDelete: hasPermission(a, "bookings:delete"),
      },
      attendance: {
        canMarkPresent: hasPermission(a, "attendance:mark_present"),
        canEditHistory: hasPermission(a, "attendance:edit_history"),
      },
      settings: {
        canEdit: hasPermission(a, "settings:edit"),
      },
      scan: {
        canCheckIn: hasPermission(a, "checkin:manual_checkin"),
        canCollectPayment: hasPermission(a, "payments:mark_paid_reception"),
      },
    };
    expect(flags.events).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
    expect(flags.products).toEqual({
      canCreate: false,
      canEdit: false,
      canDelete: false,
    });
    expect(flags.bookings).toEqual({
      canCreate: false,
      canCancel: false,
      canDelete: false,
    });
    expect(flags.attendance).toEqual({
      canMarkPresent: false,
      canEditHistory: false,
    });
    expect(flags.settings.canEdit).toBe(false);
    expect(flags.scan).toEqual({
      canCheckIn: false,
      canCollectPayment: false,
    });
  });
});
