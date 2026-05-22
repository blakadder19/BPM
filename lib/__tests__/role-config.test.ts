import { describe, expect, it } from "vitest";
import { canAccessRoute, getNavigationForAccess } from "../role-config";
import type { Permission } from "../domain/permissions";

const NONE = new Set<Permission>();

describe("getNavigationForAccess (sidebar visibility)", () => {
  it("super_admin sees every admin nav item, including permission-free ones", () => {
    const items = getNavigationForAccess({
      legacyRole: "admin",
      permissions: NONE,
      isSuperAdmin: true,
    });
    const hrefs = items.map((i) => i.href);
    // Permission-keyed admin items
    expect(hrefs).toContain("/products");
    expect(hrefs).toContain("/staff");
    expect(hrefs).toContain("/settings");
    // Permission-FREE admin items (super-admin-only fallback)
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/broadcasts");
    expect(hrefs).toContain("/studio-hire");
    expect(hrefs).toContain("/penalties");
    // Catalog is student-only and must NEVER leak into a super_admin sidebar.
    expect(hrefs).not.toContain("/catalog");
  });

  it("non-super-admin Custom user with only events:view sees Events and nothing else admin-y", () => {
    const items = getNavigationForAccess({
      legacyRole: "admin", // legacyRoleForStaffRole maps custom → 'admin'
      permissions: new Set<Permission>(["events:view"]),
      isSuperAdmin: false,
    });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/events");
    // No other admin module should be visible
    expect(hrefs).not.toContain("/products");
    expect(hrefs).not.toContain("/settings");
    expect(hrefs).not.toContain("/discount-rules");
    expect(hrefs).not.toContain("/staff");
    expect(hrefs).not.toContain("/affiliations");
    expect(hrefs).not.toContain("/finance");
    // No permission-free admin items either
    expect(hrefs).not.toContain("/terms");
    expect(hrefs).not.toContain("/broadcasts");
    expect(hrefs).not.toContain("/studio-hire");
    expect(hrefs).not.toContain("/penalties");
  });

  it("non-super-admin without events:view does NOT see Events", () => {
    const items = getNavigationForAccess({
      legacyRole: "admin",
      permissions: NONE,
      isSuperAdmin: false,
    });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/events");
  });

  it("teacher legacy role with no permissions still sees no admin items", () => {
    const items = getNavigationForAccess({
      legacyRole: "teacher",
      permissions: NONE,
      isSuperAdmin: false,
    });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/terms");
    expect(hrefs).not.toContain("/broadcasts");
    expect(hrefs).not.toContain("/studio-hire");
    expect(hrefs).not.toContain("/penalties");
    expect(hrefs).not.toContain("/products");
    expect(hrefs).not.toContain("/staff");
    expect(hrefs).not.toContain("/settings");
  });

  it("student sees the catalog (permission-free, student-only)", () => {
    const items = getNavigationForAccess({
      legacyRole: "student",
      permissions: NONE,
      isSuperAdmin: false,
    });
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/catalog");
    // And NEVER any admin-only item
    expect(hrefs).not.toContain("/terms");
    expect(hrefs).not.toContain("/staff");
    expect(hrefs).not.toContain("/settings");
  });

  it("array-form permission (e.g. Finance) matches if ANY key is held", () => {
    const items = getNavigationForAccess({
      legacyRole: "admin",
      permissions: new Set<Permission>(["payments:view_limited"]),
      isSuperAdmin: false,
    });
    expect(items.map((i) => i.href)).toContain("/finance");
  });

  describe("Catalog is student-only — never visible to staff/admin", () => {
    function hrefsFor(input: {
      legacyRole: "admin" | "teacher" | "student";
      permissions: ReadonlySet<Permission>;
      isSuperAdmin: boolean;
    }): string[] {
      return getNavigationForAccess(input).map((i) => i.href);
    }

    it("admin (non-super) never sees /catalog regardless of granted permissions", () => {
      // A maximally-permissive non-super-admin still cannot see Catalog.
      const everyPermission = new Set<Permission>([
        "dashboard:view",
        "classes:view",
        "bookings:view",
        "events:view",
        "attendance:view",
        "students:view",
        "products:view",
        "finance:view",
        "affiliations:view",
        "referrals:view",
        "discounts:view",
        "staff:view",
        "settings:view",
      ]);
      expect(
        hrefsFor({
          legacyRole: "admin",
          permissions: everyPermission,
          isSuperAdmin: false,
        }),
      ).not.toContain("/catalog");
    });

    it("super_admin never sees /catalog", () => {
      expect(
        hrefsFor({
          legacyRole: "admin",
          permissions: NONE,
          isSuperAdmin: true,
        }),
      ).not.toContain("/catalog");
    });

    it("teacher never sees /catalog", () => {
      expect(
        hrefsFor({
          legacyRole: "teacher",
          permissions: NONE,
          isSuperAdmin: false,
        }),
      ).not.toContain("/catalog");
    });

    it("front-desk / read-only / custom staff (legacyRole 'admin', no super_admin) never see /catalog", () => {
      // legacyRoleForStaffRole maps front_desk/read_only/custom → 'admin',
      // so this case mirrors what the production layout passes for those
      // staff personas.
      expect(
        hrefsFor({
          legacyRole: "admin",
          permissions: new Set<Permission>(["events:view"]),
          isSuperAdmin: false,
        }),
      ).not.toContain("/catalog");
    });

    it("student sees /catalog (positive case)", () => {
      expect(
        hrefsFor({
          legacyRole: "student",
          permissions: NONE,
          isSuperAdmin: false,
        }),
      ).toContain("/catalog");
    });
  });
});

describe("canAccessRoute — /catalog gate", () => {
  it("student can access /catalog and nested URLs", () => {
    expect(canAccessRoute("student", "/catalog")).toBe(true);
    expect(canAccessRoute("student", "/catalog/some-product")).toBe(true);
  });

  it("admin cannot access /catalog", () => {
    expect(canAccessRoute("admin", "/catalog")).toBe(false);
    expect(canAccessRoute("admin", "/catalog/some-product")).toBe(false);
  });

  it("teacher cannot access /catalog", () => {
    expect(canAccessRoute("teacher", "/catalog")).toBe(false);
  });
});
