import { describe, expect, it } from "vitest";
import {
  expandPermissions,
  normalizePermissionsForStorage,
  PERMISSION_KEYS,
  ROLE_PRESETS,
  isPermissionKey,
  isSensitivePermission,
  legacyEffectivePermissions,
  permissionsForRoleChange,
  presetPermissions,
  type Permission,
  type StaffRoleKey,
} from "../permissions";

/** Recommended defaults for a role (what the editor pre-fills). */
const preset = (role: StaffRoleKey) => new Set<Permission>(ROLE_PRESETS[role]);

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
    const set = preset("teacher");
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
    const set = preset("front_desk");
    expect(set.has("checkin:scan")).toBe(true);
    expect(set.has("payments:mark_paid_reception")).toBe(true);
    expect(set.has("settings:edit")).toBe(false);
    expect(set.has("products:edit")).toBe(false);
    expect(set.has("staff:edit_permissions")).toBe(false);
  });

  it("read_only has zero mutation perms", () => {
    const set = preset("read_only");
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

  it("non-custom roles get EXACTLY the stored list — the preset is never added back", () => {
    const set = expandPermissions("teacher", ["classes:view"] as Permission[]);
    expect([...set]).toEqual(["classes:view"]);
    expect(set.has("checkin:scan")).toBe(false);
    expect(set.has("payments:view_limited")).toBe(false);
  });

  it("an unticked preset permission stays denied (teacher without attendance:view)", () => {
    const stored = ROLE_PRESETS.teacher.filter((p) => p !== "attendance:view");
    const set = expandPermissions("teacher", stored);
    expect(set.has("attendance:view")).toBe(false);
    expect(set.size).toBe(ROLE_PRESETS.teacher.length - 1);
  });

  it("every non-super role with an empty stored list has no permissions", () => {
    for (const role of ["admin", "front_desk", "teacher", "read_only", "custom"] as const) {
      expect(expandPermissions(role, []).size).toBe(0);
      expect(expandPermissions(role, null).size).toBe(0);
    }
  });

  it("drops unknown keys from a stored list", () => {
    const set = expandPermissions("admin", ["events:view", "made:up"] as Permission[]);
    expect([...set]).toEqual(["events:view"]);
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

  it("non-custom keeps the exact list, preset permissions included", () => {
    const out = normalizePermissionsForStorage("teacher", [
      "checkin:scan",
      "bookings:view",
      "events:view",
      "events:view",
    ] as Permission[]);
    expect(out).toEqual(["checkin:scan", "bookings:view", "events:view"]);
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

  it("what is saved is exactly what is effective", () => {
    const checked = ["classes:view", "attendance:view"] as Permission[];
    for (const role of ["admin", "front_desk", "teacher", "read_only", "custom"] as const) {
      const effective = expandPermissions(role, normalizePermissionsForStorage(role, checked));
      expect([...effective].sort()).toEqual([...checked].sort());
    }
  });
});

describe("role change in the editor", () => {
  it("teacher → admin loads the admin defaults, without keeping teacher-only picks", () => {
    const teacherForm = new Set<Permission>([...ROLE_PRESETS.teacher, "students:send_magic_link"]);
    const next = permissionsForRoleChange("admin", teacherForm);
    expect([...next].sort()).toEqual([...ROLE_PRESETS.admin].sort());
    expect(next.has("students:send_magic_link")).toBe(false);
  });

  it("admin → teacher does not retain admin permissions", () => {
    const next = permissionsForRoleChange("teacher", preset("admin"));
    expect(next.has("finance:view")).toBe(false);
    expect([...next].sort()).toEqual([...ROLE_PRESETS.teacher].sort());
  });

  it("switching to custom keeps the current checkboxes", () => {
    const current = new Set<Permission>(["events:view", "classes:view"]);
    expect([...permissionsForRoleChange("custom", current)].sort()).toEqual(["classes:view", "events:view"]);
  });

  it("super_admin and custom have no defaults to reset to", () => {
    expect(presetPermissions("super_admin").size).toBe(0);
    expect(presetPermissions("custom").size).toBe(0);
  });
});

describe("legacyEffectivePermissions (pre-00080 semantics, migration only)", () => {
  it("unions the preset with stored additions for non-custom roles", () => {
    const set = legacyEffectivePermissions("teacher", ["events:view"] as Permission[]);
    for (const p of ROLE_PRESETS.teacher) {
      expect(set.has(p), p).toBe(p !== "attendance:mark_absent");
    }
    expect(set.has("events:view")).toBe(true);
  });

  it("custom and super_admin match the exact model", () => {
    expect([...legacyEffectivePermissions("custom", ["events:view"] as Permission[])]).toEqual(["events:view"]);
    expect(legacyEffectivePermissions("super_admin", null).size).toBe(PERMISSION_KEYS.length);
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
    expect(isSensitivePermission("payments:manual_adjustment")).toBe(true);
  });

  it("does not flag pure view perms", () => {
    expect(isSensitivePermission("dashboard:view")).toBe(false);
    expect(isSensitivePermission("students:view")).toBe(false);
    expect(isSensitivePermission("finance:view")).toBe(false);
  });

  it("flags referrals:reward as sensitive (manual money handling)", () => {
    expect(isSensitivePermission("referrals:reward")).toBe(true);
  });
});

describe("payments:manual_adjustment", () => {
  it("is part of the permission catalogue", () => {
    expect(isPermissionKey("payments:manual_adjustment")).toBe(true);
  });

  it("super_admin gets it automatically", () => {
    const set = expandPermissions("super_admin", null);
    expect(set.has("payments:manual_adjustment")).toBe(true);
  });

  it("admin preset does NOT get it by default", () => {
    const set = preset("admin");
    expect(set.has("payments:manual_adjustment")).toBe(false);
  });

  it("front_desk / teacher / read_only do NOT get it", () => {
    for (const role of ["front_desk", "teacher", "read_only"] as const) {
      const set = preset(role);
      expect(set.has("payments:manual_adjustment")).toBe(false);
    }
  });

  it("custom roles can be granted it explicitly", () => {
    const set = expandPermissions(
      "custom",
      ["payments:manual_adjustment"] as Permission[],
    );
    expect(set.has("payments:manual_adjustment")).toBe(true);
  });
});

describe("students:send_magic_link", () => {
  it("is part of the permission catalogue", () => {
    expect(isPermissionKey("students:send_magic_link")).toBe(true);
  });

  it("is flagged sensitive", () => {
    expect(isSensitivePermission("students:send_magic_link")).toBe(true);
  });

  it("super_admin gets it automatically", () => {
    const set = expandPermissions("super_admin", null);
    expect(set.has("students:send_magic_link")).toBe(true);
  });

  it("admin / front_desk / teacher / read_only do NOT get it by default", () => {
    for (const role of [
      "admin",
      "front_desk",
      "teacher",
      "read_only",
    ] as const) {
      const set = preset(role);
      expect(set.has("students:send_magic_link")).toBe(false);
    }
  });

  it("custom roles can be granted it explicitly", () => {
    const set = expandPermissions(
      "custom",
      ["students:send_magic_link"] as Permission[],
    );
    expect(set.has("students:send_magic_link")).toBe(true);
  });
});

describe("referral permissions", () => {
  it("are all present in PERMISSION_KEYS", () => {
    for (const k of [
      "referrals:view",
      "referrals:create",
      "referrals:verify",
      "referrals:reward",
      "referrals:cancel",
    ] as Permission[]) {
      expect(isPermissionKey(k)).toBe(true);
    }
  });

  it("admin preset includes all referral perms", () => {
    const set = preset("admin");
    for (const k of [
      "referrals:view",
      "referrals:create",
      "referrals:verify",
      "referrals:reward",
      "referrals:cancel",
    ] as Permission[]) {
      expect(set.has(k)).toBe(true);
    }
  });

  it("front_desk preset includes view+create+verify, NOT reward/cancel", () => {
    const set = preset("front_desk");
    expect(set.has("referrals:view")).toBe(true);
    expect(set.has("referrals:create")).toBe(true);
    expect(set.has("referrals:verify")).toBe(true);
    expect(set.has("referrals:reward")).toBe(false);
    expect(set.has("referrals:cancel")).toBe(false);
  });

  it("read_only sees referrals but cannot mutate", () => {
    const set = preset("read_only");
    expect(set.has("referrals:view")).toBe(true);
    expect(set.has("referrals:create")).toBe(false);
    expect(set.has("referrals:verify")).toBe(false);
    expect(set.has("referrals:reward")).toBe(false);
    expect(set.has("referrals:cancel")).toBe(false);
  });

  it("teacher has no referral perms", () => {
    const set = preset("teacher");
    expect(set.has("referrals:view")).toBe(false);
    expect(set.has("referrals:create")).toBe(false);
  });
});
