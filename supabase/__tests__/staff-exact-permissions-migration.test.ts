/**
 * Migration 00080 converts "preset + additions" rows into exact grants.
 * Every existing staff member keeps their pre-migration effective
 * permissions; the only gain is the new Teacher default
 * attendance:mark_absent.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRESET_ADDITIONS_00080,
  PRESET_ADDITIONS_00081,
  ROLE_PRESETS,
  expandPermissions,
  legacyEffectivePermissions,
  type Permission,
  type StaffRoleKey,
} from "@/lib/domain/permissions";

const ROOT = join(__dirname, "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase/migrations/00080_staff_exact_permissions.sql"), "utf8");
const DIAGNOSTIC = readFileSync(
  join(ROOT, "supabase/diagnostics/2026-10-01-staff-exact-permissions.sql"),
  "utf8",
);

const PRESET_ROLES = ["admin", "front_desk", "teacher", "read_only"] as const;

/** Extracts the frozen preset arrays from `'role', '[ ... ]'::jsonb` pairs. */
function frozenPresets(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /\(?'(admin|front_desk|teacher|read_only)',\s*'(\[[\s\S]*?\])'::jsonb/g;
  for (const m of sql.matchAll(re)) out[m[1]] = JSON.parse(m[2]);
  return out;
}

/** The migration's conversion, mirrored in TS. */
function convert(roleKey: StaffRoleKey | null, stored: Permission[], frozen: Record<string, string[]>) {
  if (roleKey && (PRESET_ROLES as readonly string[]).includes(roleKey)) {
    return [...new Set([...(frozen[roleKey] as Permission[]), ...stored])].sort();
  }
  return stored;
}

// Production shapes from the 2026-10-01 diagnostic, with synthetic identities.
const ROWS: { label: string; roleKey: StaffRoleKey | null; stored: Permission[] }[] = [
  { label: "super admin (null list)", roleKey: "super_admin", stored: [] },
  { label: "admin + extras", roleKey: "admin", stored: ["students:send_magic_link", "payments:view_limited"] },
  { label: "teacher + classes/events", roleKey: "teacher", stored: ["events:view", "classes:view"] },
  { label: "teacher + students:create", roleKey: "teacher", stored: ["students:create", "events:view", "classes:view"] },
  {
    label: "student+teacher + student tools",
    roleKey: "teacher",
    stored: ["students:create", "students:manage_affiliations", "students:send_magic_link"],
  },
  { label: "front desk, no extras", roleKey: "front_desk", stored: [] },
  { label: "read only + extra", roleKey: "read_only", stored: ["events:create"] },
  { label: "custom", roleKey: "custom", stored: ["events:view", "finance:view"] },
  {
    label: "legacy full-preset row (stored preset + extras)",
    roleKey: "teacher",
    stored: [...ROLE_PRESETS.teacher, "events:view"],
  },
];

/** ROLE_PRESETS as of 00080, i.e. without keys added by later migrations. */
function presetAt00080(role: (typeof PRESET_ROLES)[number]): string[] {
  const later = PRESET_ADDITIONS_00081[role] ?? [];
  return ROLE_PRESETS[role].filter((p) => !later.includes(p)).sort();
}

describe("migration 00080 — frozen presets", () => {
  it("contains a frozen copy of every non-super preset equal to ROLE_PRESETS as of 00080", () => {
    const frozen = frozenPresets(MIGRATION);
    for (const role of PRESET_ROLES) {
      expect(frozen[role]?.slice().sort()).toEqual(presetAt00080(role));
    }
  });

  it("the read-only diagnostic uses the same presets", () => {
    const frozen = frozenPresets(DIAGNOSTIC);
    for (const role of PRESET_ROLES) {
      expect(frozen[role]?.slice().sort()).toEqual(presetAt00080(role));
    }
  });
});

describe("migration 00080 — nobody loses access; the only gain is the new Teacher default", () => {
  const frozen = frozenPresets(MIGRATION);

  it("the only preset addition is attendance:mark_absent for Teacher, not Front Desk", () => {
    expect(PRESET_ADDITIONS_00080).toEqual({ teacher: ["attendance:mark_absent"] });
    expect(ROLE_PRESETS.teacher).toContain("attendance:mark_absent");
    expect(ROLE_PRESETS.front_desk).not.toContain("attendance:mark_absent");
    for (const role of ["teacher", "front_desk"] as const) {
      expect(ROLE_PRESETS[role]).not.toContain("attendance:edit_history");
      expect(ROLE_PRESETS[role]).not.toContain("attendance:backdate");
    }
    expect(DIAGNOSTIC).toContain("values ('teacher', array['attendance:mark_absent'])");
  });

  it.each(ROWS)("$label", ({ roleKey, stored }) => {
    const before = legacyEffectivePermissions(roleKey, stored);
    const after = expandPermissions(roleKey, convert(roleKey, stored, frozen));
    const expected = new Set([...before, ...((roleKey && PRESET_ADDITIONS_00080[roleKey]) || [])]);
    expect([...after].sort()).toEqual([...expected].sort());
    for (const p of before) expect(after.has(p), p).toBe(true);
  });

  it("existing teachers gain attendance:mark_absent; front desk does not", () => {
    const teacher = expandPermissions("teacher", convert("teacher", ["events:view"], frozen));
    const frontDesk = expandPermissions("front_desk", convert("front_desk", [], frozen));
    expect(legacyEffectivePermissions("teacher", ["events:view"]).has("attendance:mark_absent")).toBe(false);
    expect(teacher.has("attendance:mark_absent")).toBe(true);
    expect(frontDesk.has("attendance:mark_absent")).toBe(false);
  });

  it("is idempotent in content (a second conversion changes nothing)", () => {
    for (const { roleKey, stored } of ROWS) {
      const once = convert(roleKey, stored, frozen);
      expect(convert(roleKey, once, frozen)).toEqual(once);
    }
  });

  it("a base-role teacher with no grant keeps the teacher preset as an explicit grant", () => {
    expect(MIGRATION).toMatch(
      /set staff_role_key\s+= 'teacher',\s*staff_permissions = presets -> 'teacher'[\s\S]*?where staff_role_key is null\s*and role::text = 'teacher'\s*and coalesce\(staff_status, 'active'\) = 'active'/,
    );
  });
});

describe("migration 00080 — safety", () => {
  it("runs once: a marker row short-circuits any later run", () => {
    expect(MIGRATION).toMatch(/if exists \(select 1 from public\.staff_permission_model_marker\) then[\s\S]*?return;/);
    expect(MIGRATION).toMatch(/insert into public\.staff_permission_model_marker default values;\s*end \$\$;/);
  });

  it("backs up users and pending invites before changing them", () => {
    const backup = MIGRATION.indexOf("insert into public.staff_permissions_pre_00080");
    const inviteBackup = MIGRATION.indexOf("insert into public.staff_invites_pre_00080");
    const firstUpdate = MIGRATION.indexOf("update public.users");
    expect(backup).toBeGreaterThan(0);
    expect(inviteBackup).toBeGreaterThan(0);
    expect(backup).toBeLessThan(firstUpdate);
    expect(inviteBackup).toBeLessThan(firstUpdate);
  });

  it("leaves custom and super_admin rows alone", () => {
    expect(MIGRATION).toMatch(/where u\.staff_role_key in \('admin', 'front_desk', 'teacher', 'read_only'\)/);
  });

  it("converts only pending invites", () => {
    expect(MIGRATION).toMatch(/where i\.status = 'pending'\s*and i\.role_key in \('admin', 'front_desk', 'teacher', 'read_only'\)/);
  });

  it("new tables are not readable by clients", () => {
    for (const t of ["staff_permission_model_marker", "staff_permissions_pre_00080", "staff_invites_pre_00080"]) {
      expect(MIGRATION).toContain(`alter table public.${t}`);
      expect(MIGRATION).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated;`));
    }
  });
});
