import { describe, expect, it } from "vitest";
import {
  expandPermissions,
  PERMISSION_KEYS,
  ROLE_PRESETS,
  isPermissionKey,
  isSensitivePermission,
  type Permission,
} from "../permissions";

describe("expandPermissions", () => {
  it("super_admin always resolves to every permission key", () => {
    const set = expandPermissions("super_admin", null);
    expect(set.size).toBe(PERMISSION_KEYS.length);
    for (const k of PERMISSION_KEYS) {
      expect(set.has(k)).toBe(true);
    }
  });

  it("super_admin ignores override list (no widening or narrowing surprises)", () => {
    const setA = expandPermissions("super_admin", []);
    const setB = expandPermissions("super_admin", ["finance:refund"] as Permission[]);
    expect(setA.size).toBe(setB.size);
  });

  it("custom returns ONLY the override list", () => {
    const set = expandPermissions(
      "custom",
      ["checkin:scan", "checkin:manual_checkin"] as Permission[],
    );
    expect(set.has("checkin:scan")).toBe(true);
    expect(set.has("checkin:manual_checkin")).toBe(true);
    expect(set.has("dashboard:view")).toBe(false);
  });

  it("teacher preset includes operational reception perms but no settings/products edit", () => {
    const set = expandPermissions("teacher", null);
    expect(set.has("checkin:scan")).toBe(true);
    expect(set.has("checkin:manual_checkin")).toBe(true);
    expect(set.has("payments:mark_paid_reception")).toBe(true);
    expect(set.has("settings:edit")).toBe(false);
    expect(set.has("products:edit")).toBe(false);
    expect(set.has("staff:edit_permissions")).toBe(false);
    expect(set.has("finance:refund")).toBe(false);
    expect(set.has("finance:danger_zone")).toBe(false);
  });

  it("front_desk preset includes operational reception perms but no settings/products edit", () => {
    const set = expandPermissions("front_desk", null);
    expect(set.has("checkin:scan")).toBe(true);
    expect(set.has("payments:mark_paid_reception")).toBe(true);
    expect(set.has("settings:edit")).toBe(false);
    expect(set.has("products:edit")).toBe(false);
    expect(set.has("staff:edit_permissions")).toBe(false);
  });

  it("read_only has zero mutation perms", () => {
    const set = expandPermissions("read_only", null);
    for (const p of [
      "products:edit",
      "products:delete",
      "settings:edit",
      "discounts:edit",
      "discounts:delete",
      "affiliations:create",
      "affiliations:edit",
      "affiliations:delete",
      "staff:invite",
      "staff:edit_permissions",
      "staff:disable",
      "finance:refund",
      "finance:danger_zone",
      "payments:refund",
      "payments:mark_paid_reception",
      "bookings:cancel",
      "bookings:delete",
    ] as Permission[]) {
      expect(set.has(p)).toBe(false);
    }
  });

  it("override extends a preset (additive, not replacement) for non-custom roles", () => {
    const baseSize = ROLE_PRESETS.teacher.length;
    const set = expandPermissions(
      "teacher",
      ["finance:view"] as Permission[],
    );
    expect(set.has("finance:view")).toBe(true);
    expect(set.has("checkin:scan")).toBe(true); // still has preset perms
    expect(set.size).toBeGreaterThan(baseSize);
  });

  it("null roleKey + null override = empty set (defensive default)", () => {
    const set = expandPermissions(null, null);
    expect(set.size).toBe(0);
  });
});

describe("isPermissionKey", () => {
  it("returns true only for known keys", () => {
    expect(isPermissionKey("checkin:scan")).toBe(true);
    expect(isPermissionKey("not:real")).toBe(false);
    expect(isPermissionKey("")).toBe(false);
  });
});

describe("isSensitivePermission", () => {
  it("flags finance/staff/products edit as sensitive", () => {
    expect(isSensitivePermission("finance:refund")).toBe(true);
    expect(isSensitivePermission("finance:danger_zone")).toBe(true);
    expect(isSensitivePermission("settings:edit")).toBe(true);
    expect(isSensitivePermission("products:edit")).toBe(true);
    expect(isSensitivePermission("staff:edit_permissions")).toBe(true);
    expect(isSensitivePermission("payments:mark_paid_reception")).toBe(true);
  });

  it("does not flag pure view perms", () => {
    expect(isSensitivePermission("dashboard:view")).toBe(false);
    expect(isSensitivePermission("students:view")).toBe(false);
    expect(isSensitivePermission("finance:view")).toBe(false);
  });
});
