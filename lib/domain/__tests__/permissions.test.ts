import { describe, expect, it } from "vitest";
import {
  expandPermissions,
  normalizePermissionsForStorage,
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

describe("normalizePermissionsForStorage", () => {
  it("super_admin always normalizes to empty (sentinel)", () => {
    const out = normalizePermissionsForStorage("super_admin", [
      "events:view",
      "settings:edit",
    ] as Permission[]);
    expect(out).toEqual([]);
  });

  it("custom keeps the exact list (deduped + sanitized)", () => {
    const out = normalizePermissionsForStorage("custom", [
      "events:view",
      "events:view",
      "checkin:scan",
    ] as Permission[]);
    expect(out.sort()).toEqual(["checkin:scan", "events:view"]);
  });

  it("custom drops unknown keys defensively", () => {
    const out = normalizePermissionsForStorage("custom", [
      "events:view",
      "made:up",
    ] as Permission[]);
    expect(out).toEqual(["events:view"]);
  });

  it("non-custom drops permissions already in the preset (additions only)", () => {
    // Teacher preset includes checkin:scan and bookings:view.
    const out = normalizePermissionsForStorage("teacher", [
      "checkin:scan",
      "bookings:view",
      "events:view",
    ] as Permission[]);
    expect(out.includes("checkin:scan")).toBe(false);
    expect(out.includes("bookings:view")).toBe(false);
    expect(out).toEqual(["events:view"]);
  });

  it("expandPermissions(role, normalized) reproduces effective set", () => {
    const inputAll = [
      "checkin:scan", // in teacher preset
      "events:view", // not in teacher preset
    ] as Permission[];
    const stored = normalizePermissionsForStorage("teacher", inputAll);
    const effective = expandPermissions("teacher", stored);
    for (const k of inputAll) expect(effective.has(k)).toBe(true);
  });

  it("custom-only-events:view yields effective={events:view}", () => {
    const stored = normalizePermissionsForStorage("custom", [
      "events:view",
    ] as Permission[]);
    const effective = expandPermissions("custom", stored);
    expect(effective.has("events:view")).toBe(true);
    expect(effective.has("dashboard:view")).toBe(false);
    expect(effective.has("students:view")).toBe(false);
    expect(effective.size).toBe(1);
  });

  it("switching admin → teacher does not retain stale admin perms", () => {
    // Simulate the legacy-buggy storage shape where the override
    // contained `[adminPreset + extras]`. Once normalized for the
    // *new* teacher role, only the extras should remain.
    const adminPreset = ROLE_PRESETS.admin;
    const oldStored = [...adminPreset, "finance:refund" as Permission];
    const renormalized = normalizePermissionsForStorage(
      "teacher",
      oldStored as Permission[],
    );
    // Anything that's now in the teacher preset should be dropped.
    for (const p of ROLE_PRESETS.teacher) {
      expect(renormalized.includes(p)).toBe(false);
    }
    // The non-teacher-preset admin perms remain as overrides — that's
    // expected for a one-off switch. The editor's role-change UX
    // resets overrides, so in practice the user clears these.
    expect(renormalized.includes("finance:refund")).toBe(true);
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
