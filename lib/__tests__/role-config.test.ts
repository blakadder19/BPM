import { describe, expect, it } from "vitest";
import { getNavigationForAccess } from "../role-config";
import type { Permission } from "../domain/permissions";

const NONE = new Set<Permission>();

describe("getNavigationForAccess (sidebar visibility)", () => {
  it("super_admin sees every nav item, including permission-free ones", () => {
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
});
