/**
 * Migration 00081 splits students:assign_subscription and
 * payments:grant_complimentary out of students:edit. Everyone who could
 * assign passes before (every holder of students:edit, who could also pick
 * Complimentary / Waived) keeps exactly that; nobody else gains either key,
 * and nobody gains payments:manual_adjustment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRESET_ADDITIONS_00081,
  ROLE_PRESETS,
  expandPermissions,
  type Permission,
  type StaffRoleKey,
} from "@/lib/domain/permissions";
import { allowedAssignPaymentStatuses } from "@/lib/domain/assign-payment-status";

const ROOT = join(__dirname, "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase/migrations/00081_students_assign_subscription.sql"), "utf8");
const DIAGNOSTIC = readFileSync(join(ROOT, "supabase/diagnostics/2026-10-05-students-assign-subscription.sql"), "utf8");

const ASSIGN: Permission = "students:assign_subscription";
const COMP: Permission = "payments:grant_complimentary";
const NEW_KEYS: readonly Permission[] = [ASSIGN, COMP];

/** The migration's conversion, mirrored in TS. */
function convert(roleKey: StaffRoleKey | null, stored: Permission[] | null): Permission[] | null {
  if (!roleKey || roleKey === "super_admin" || !stored) return stored;
  if (!stored.includes("students:edit")) return stored;
  return [...stored, ...NEW_KEYS.filter((k) => !stored.includes(k))];
}

/** Could this grant assign subscriptions before 00081 (gate was students:edit)? */
const couldAssignBefore = (roleKey: StaffRoleKey | null, stored: Permission[] | null) =>
  expandPermissions(roleKey, stored).has("students:edit");

const withoutNew = (keys: readonly Permission[]) => keys.filter((p) => !NEW_KEYS.includes(p));

// Anisia's production grant shape on 2026-10-05: the Admin preset as it was
// before 00081, plus send_magic_link. Synthetic identity.
const ANISIA_SHAPE: Permission[] = [...withoutNew(ROLE_PRESETS.admin), "students:send_magic_link"];

const ROWS: { label: string; roleKey: StaffRoleKey | null; stored: Permission[] | null }[] = [
  { label: "super admin (null list)", roleKey: "super_admin", stored: null },
  { label: "admin with students:edit (Anisia's shape)", roleKey: "admin", stored: ANISIA_SHAPE },
  { label: "teacher defaults + manual check-in", roleKey: "teacher", stored: [...ROLE_PRESETS.teacher] },
  { label: "teacher + student tools (Guille's shape)", roleKey: "teacher", stored: [...ROLE_PRESETS.teacher, "students:create", "students:send_magic_link"] },
  { label: "custom with students:edit", roleKey: "custom", stored: ["students:view", "students:edit"] },
  { label: "custom without students:edit", roleKey: "custom", stored: ["students:view"] },
  { label: "already has both keys", roleKey: "admin", stored: ["students:edit", ASSIGN, COMP] },
  { label: "has one key already", roleKey: "admin", stored: ["students:edit", ASSIGN] },
  { label: "no grant", roleKey: null, stored: null },
];

describe("migration 00081 — preserves existing ability, adds nothing else", () => {
  it.each(ROWS)("$label", ({ roleKey, stored }) => {
    const before = expandPermissions(roleKey, stored);
    const after = expandPermissions(roleKey, convert(roleKey, stored));
    for (const p of before) expect(after.has(p), p).toBe(true);
    const gained = [...after].filter((p) => !before.has(p));
    if (couldAssignBefore(roleKey, stored)) {
      expect(after.has(ASSIGN)).toBe(true);
      expect(after.has(COMP)).toBe(true);
      expect(gained.every((p) => NEW_KEYS.includes(p))).toBe(true);
    } else {
      expect(gained).toEqual([]);
    }
    if (roleKey !== "super_admin") {
      expect(after.has("payments:manual_adjustment")).toBe(before.has("payments:manual_adjustment"));
    }
  });

  it("Anisia keeps creating Pending, Paid, Complimentary and Waived passes, without manual adjustments", () => {
    const before = expandPermissions("admin", ANISIA_SHAPE);
    expect(before.has("students:edit")).toBe(true);
    expect(before.has("payments:mark_paid_reception")).toBe(true);
    expect(before.has(ASSIGN)).toBe(false);
    expect(before.has(COMP)).toBe(false);
    const after = expandPermissions("admin", convert("admin", ANISIA_SHAPE));
    expect(allowedAssignPaymentStatuses((p) => after.has(p))).toEqual(["paid", "pending", "complimentary", "waived"]);
    expect(after.has("payments:manual_adjustment")).toBe(false);
    expect([...after].filter((p) => !before.has(p)).sort()).toEqual([COMP, ASSIGN].sort());
  });

  it("Guille's shape gains neither key", () => {
    const stored: Permission[] = [...ROLE_PRESETS.teacher, "students:create", "students:send_magic_link"];
    expect(convert("teacher", stored)).toEqual(stored);
  });

  it("only the Admin preset gains the keys", () => {
    expect(PRESET_ADDITIONS_00081).toEqual({ admin: [ASSIGN, COMP] });
    expect(ROLE_PRESETS.admin).toContain("students:edit");
    for (const role of ["teacher", "front_desk", "read_only"] as const) {
      expect(ROLE_PRESETS[role]).not.toContain(ASSIGN);
      expect(ROLE_PRESETS[role]).not.toContain(COMP);
    }
  });

  it("is idempotent in content", () => {
    for (const { roleKey, stored } of ROWS) {
      const once = convert(roleKey, stored);
      expect(convert(roleKey, once)).toEqual(once);
    }
  });
});

describe("migration 00081 — SQL", () => {
  it("declares exactly the two new keys", () => {
    expect(MIGRATION).toContain(
      "new_keys constant text[] := array['students:assign_subscription', 'payments:grant_complimentary'];",
    );
    expect(MIGRATION).not.toMatch(/'payments:manual_adjustment'/);
  });

  it("targets non-super-admin grants holding students:edit and lacking either key", () => {
    expect(MIGRATION).toMatch(
      /from public\.users\s+where staff_role_key is not null\s+and staff_role_key <> 'super_admin'\s+and jsonb_typeof\(staff_permissions\) = 'array'\s+and staff_permissions \? 'students:edit'\s+and not staff_permissions \?& new_keys;/,
    );
  });

  it("targets only pending invites holding students:edit", () => {
    expect(MIGRATION).toMatch(
      /from public\.staff_invites\s+where status = 'pending'\s+and role_key <> 'super_admin'\s+and jsonb_typeof\(permissions\) = 'array'\s+and permissions \? 'students:edit'\s+and not permissions \?& new_keys;/,
    );
  });

  it("updates exactly the backed-up rows, appending only the keys each lacks", () => {
    expect(MIGRATION).toMatch(
      /update public\.users u\s+set staff_permissions = u\.staff_permissions \|\| \(\s+select coalesce\(jsonb_agg\(k order by k\), '\[\]'::jsonb\)\s+from unnest\(new_keys\) as k\s+where not u\.staff_permissions \? k\s+\)\s+from public\.staff_permissions_pre_00081 b\s+where b\.user_id = u\.id;/,
    );
    expect(MIGRATION).toMatch(
      /update public\.staff_invites i\s+set permissions = i\.permissions \|\| \(\s+select coalesce\(jsonb_agg\(k order by k\), '\[\]'::jsonb\)\s+from unnest\(new_keys\) as k\s+where not i\.permissions \? k\s+\)\s+from public\.staff_invites_pre_00081 b\s+where b\.invite_id = i\.id;/,
    );
    expect(MIGRATION.match(/^\s*update /gm)).toHaveLength(2);
  });

  it("backs up before changing anything", () => {
    const firstUpdate = MIGRATION.indexOf("update public.users");
    expect(MIGRATION.indexOf("insert into public.staff_permissions_pre_00081")).toBeGreaterThan(0);
    expect(MIGRATION.indexOf("insert into public.staff_permissions_pre_00081")).toBeLessThan(firstUpdate);
    expect(MIGRATION.indexOf("insert into public.staff_invites_pre_00081")).toBeLessThan(firstUpdate);
  });

  it("runs once and requires 00080", () => {
    expect(MIGRATION).toMatch(
      /if exists \(select 1 from public\.staff_permission_migrations where key = '00081_students_assign_subscription'\) then[\s\S]*?return;/,
    );
    expect(MIGRATION).toMatch(/if not exists \(select 1 from public\.staff_permission_model_marker\) then\s+raise exception/);
    expect(MIGRATION).toMatch(
      /insert into public\.staff_permission_migrations \(key\) values \('00081_students_assign_subscription'\);\s*end \$\$;/,
    );
  });

  it("new tables are not readable by clients", () => {
    for (const t of ["staff_permission_migrations", "staff_permissions_pre_00081", "staff_invites_pre_00081"]) {
      expect(MIGRATION).toContain(`alter table public.${t}`);
      expect(MIGRATION).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated;`));
    }
  });

  it("the diagnostic previews the same rows and changes nothing", () => {
    expect(DIAGNOSTIC).toContain("and staff_permissions ? 'students:edit'");
    expect(DIAGNOSTIC).toContain(
      "and not staff_permissions ?& array['students:assign_subscription', 'payments:grant_complimentary']",
    );
    expect(DIAGNOSTIC).toContain("where status = 'pending'");
    expect(DIAGNOSTIC).not.toMatch(/\b(update|insert|delete|alter|create|drop)\b/i);
  });
});
