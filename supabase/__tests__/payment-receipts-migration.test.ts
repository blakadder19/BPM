/**
 * Migration 00082 (Payment Receipts): non-destructive product identity
 * backfill, service-role-only guest receipt tokens, and payments:send_receipt
 * for current Admins only. Not applied by these tests — they check the SQL
 * text and mirror the grant conversion in TS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERMISSION_KEYS,
  PRESET_ADDITIONS_00082,
  ROLE_PRESETS,
  expandPermissions,
  type Permission,
  type StaffRoleKey,
} from "@/lib/domain/permissions";

const ROOT = join(__dirname, "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase/migrations/00082_payment_receipts.sql"), "utf8");
const DIAGNOSTIC = readFileSync(join(ROOT, "supabase/diagnostics/2026-11-17-payment-receipts-00082.sql"), "utf8");
const SQL_CODE = MIGRATION.replace(/--.*$/gm, "");

const KEY: Permission = "payments:send_receipt";

/** The migration's grant step, mirrored in TS. */
function convert(
  roleKey: StaffRoleKey | null,
  status: "active" | "pending" | "disabled" | null,
  stored: Permission[] | null,
): Permission[] | null {
  if (roleKey !== "admin" || (status !== "active" && status !== "pending") || !stored) return stored;
  return stored.includes(KEY) ? stored : [...stored, KEY];
}

const ADMIN_BEFORE = ROLE_PRESETS.admin.filter((p) => p !== KEY);

const ROWS: {
  label: string;
  roleKey: StaffRoleKey | null;
  status: "active" | "pending" | "disabled" | null;
  stored: Permission[] | null;
  gains: boolean;
}[] = [
  { label: "active admin (preset before 00082)", roleKey: "admin", status: "active", stored: ADMIN_BEFORE, gains: true },
  { label: "pending admin", roleKey: "admin", status: "pending", stored: ["payments:view"], gains: true },
  { label: "disabled admin", roleKey: "admin", status: "disabled", stored: ADMIN_BEFORE, gains: false },
  { label: "admin already holding the key", roleKey: "admin", status: "active", stored: [...ADMIN_BEFORE, KEY], gains: false },
  { label: "teacher defaults", roleKey: "teacher", status: "active", stored: [...ROLE_PRESETS.teacher], gains: false },
  { label: "teacher with payments:view", roleKey: "teacher", status: "active", stored: [...ROLE_PRESETS.teacher, "payments:view"], gains: false },
  { label: "front desk", roleKey: "front_desk", status: "active", stored: [...ROLE_PRESETS.front_desk], gains: false },
  { label: "read only", roleKey: "read_only", status: "active", stored: [...ROLE_PRESETS.read_only], gains: false },
  { label: "custom with every view key", roleKey: "custom", status: "active", stored: ["payments:view", "payments:view_limited", "students:view", "finance:view"], gains: false },
  { label: "super admin (null list)", roleKey: "super_admin", status: "active", stored: null, gains: false },
  { label: "no grant", roleKey: null, status: null, stored: null, gains: false },
];

describe("00082 — permission semantics", () => {
  it("adds payments:send_receipt to the Admin preset only", () => {
    expect(PERMISSION_KEYS).toContain(KEY);
    expect(PRESET_ADDITIONS_00082).toEqual({ admin: [KEY] });
    expect(ROLE_PRESETS.admin).toContain(KEY);
    for (const role of ["teacher", "front_desk", "read_only"] as const) {
      expect(ROLE_PRESETS[role]).not.toContain(KEY);
    }
  });

  it("no view permission unlocks it", () => {
    for (const view of ["payments:view", "payments:view_limited", "students:view", "finance:view"] as const) {
      expect(expandPermissions("custom", [view]).has(KEY), view).toBe(false);
    }
    expect(expandPermissions("custom", ["payments:view", "payments:view_limited", "students:view", "finance:view"]).has(KEY)).toBe(false);
  });

  it("Super Admin resolves to it without a stored grant", () => {
    expect(expandPermissions("super_admin", null).has(KEY)).toBe(true);
  });

  it.each(ROWS)("$label", ({ roleKey, status, stored, gains }) => {
    const before = expandPermissions(roleKey, stored);
    const after = expandPermissions(roleKey, convert(roleKey, status, stored));
    for (const p of before) expect(after.has(p), p).toBe(true);
    const gained = [...after].filter((p) => !before.has(p));
    expect(gained).toEqual(gains ? [KEY] : []);
  });

  it("is idempotent in content", () => {
    for (const { roleKey, status, stored } of ROWS) {
      const once = convert(roleKey, status, stored);
      expect(convert(roleKey, status, once)).toEqual(once);
    }
  });
});

describe("00082 — subscription product identity backfill", () => {
  it("adds the columns idempotently", () => {
    expect(MIGRATION).toMatch(/add column if not exists product_name_snapshot text/);
    expect(MIGRATION).toMatch(/add column if not exists product_type_snapshot text/);
  });

  it("fills only NULLs, never overwriting a frozen value", () => {
    expect(MIGRATION).toMatch(/set product_name_snapshot = coalesce\(s\.product_name_snapshot, p\.name\)/);
    expect(MIGRATION).toMatch(/product_type_snapshot = coalesce\(s\.product_type_snapshot, p\.product_type::text\)/);
    expect(MIGRATION).toMatch(/and \(s\.product_name_snapshot is null or s\.product_type_snapshot is null\)/);
  });

  it("records every backfilled row and leaves updated_at untouched", () => {
    expect(MIGRATION).toMatch(/insert into public\.student_subscription_identity_backfill_00082/);
    expect(MIGRATION).toMatch(/disable trigger trg_student_subscriptions_updated_at/);
    expect(MIGRATION).toMatch(/enable trigger trg_student_subscriptions_updated_at/);
    expect(SQL_CODE).not.toMatch(/updated_at\s*=/);
  });

  it("is non-destructive", () => {
    expect(SQL_CODE).not.toMatch(/\b(drop|truncate)\b/i);
    expect(SQL_CODE).not.toMatch(/\bdelete\s+from\b/i);
    expect(SQL_CODE).not.toMatch(/price_cents_at_purchase|vat_amount_cents|subtotal_ex_vat_cents|total_inc_vat_cents/);
  });
});

describe("00082 — event purchase title snapshot", () => {
  it("adds event_title_snapshot idempotently", () => {
    expect(MIGRATION).toMatch(/alter table public\.event_purchases\s+add column if not exists event_title_snapshot text;/);
  });

  it("backfills from the current event title only where null, never overwriting", () => {
    expect(MIGRATION).toMatch(
      /update public\.event_purchases ep\s+set event_title_snapshot = e\.title\s+from public\.special_events e\s+where e\.id = ep\.event_id\s+and ep\.event_title_snapshot is null/,
    );
    expect(SQL_CODE).not.toMatch(/coalesce\(e\.title/);
    expect(SQL_CODE.match(/set event_title_snapshot/g)).toHaveLength(1);
  });

  it("records every backfilled row and documents migration-time semantics", () => {
    expect(MIGRATION).toMatch(/insert into public\.event_purchase_title_backfill_00082 \(event_purchase_id, event_title_snapshot\)/);
    expect(MIGRATION).toMatch(/comment on column public\.event_purchases\.event_title_snapshot is\s+'[^']*title current at migration time/);
    expect(MIGRATION).toMatch(/alter table public\.event_purchase_title_backfill_00082 enable row level security;/);
    expect(MIGRATION).toMatch(/revoke all on public\.event_purchase_title_backfill_00082 from anon, authenticated;/);
  });

  it("touches no other event purchase column", () => {
    const updates = SQL_CODE.match(/update public\.event_purchases[\s\S]*?returning/g) ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toMatch(/paid_amount_cents|refunded|payment_status|guest_/);
  });

  it("the diagnostic previews the title backfill read-only", () => {
    expect(DIAGNOSTIC).toContain("left join public.special_events e on e.id = ep.event_id");
  });
});

describe("00082 — receipt_access_tokens", () => {
  it("is scoped to event purchases and stores only a SHA-256 hex hash", () => {
    expect(MIGRATION).toMatch(/event_purchase_id uuid not null references public\.event_purchases\(id\) on delete cascade/);
    expect(MIGRATION).toMatch(/token_hash\s+text not null unique check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(SQL_CODE).not.toMatch(/raw_token|token_plain|\btoken\s+text/);
    expect(MIGRATION).not.toMatch(/student_subscriptions\(id\)/);
  });

  it("allows at most one active token per purchase", () => {
    expect(MIGRATION).toMatch(
      /create unique index if not exists receipt_access_tokens_one_active_per_purchase\s+on public\.receipt_access_tokens \(event_purchase_id\)\s+where revoked_at is null;/,
    );
  });

  it("RLS on, no policies, no client grants", () => {
    expect(MIGRATION).toMatch(/alter table public\.receipt_access_tokens enable row level security;/);
    expect(MIGRATION).toMatch(/revoke all on public\.receipt_access_tokens from anon, authenticated;/);
    expect(SQL_CODE).not.toMatch(/create policy/i);
  });

  it("rotation locks a guest purchase, revokes the active token and inserts in one call", () => {
    expect(MIGRATION).toMatch(/security invoker\s+set search_path = public/);
    expect(MIGRATION).toMatch(/where id = p_event_purchase_id\s+and student_id is null\s+for update;/);
    const revoke = MIGRATION.indexOf("set revoked_at = now()");
    const insert = MIGRATION.indexOf("insert into public.receipt_access_tokens");
    expect(revoke).toBeGreaterThan(0);
    expect(revoke).toBeLessThan(insert);
    expect(MIGRATION).toMatch(/revoke all on function public\.rotate_receipt_access_token\([^)]*\)\s+from public, anon, authenticated;/);
    expect(MIGRATION).toMatch(/grant execute on function public\.rotate_receipt_access_token\([^)]*\)\s+to service_role;/);
  });
});

describe("00082 — payments:send_receipt grant SQL", () => {
  it("targets only active/pending Admin grants lacking the key", () => {
    expect(MIGRATION).toMatch(
      /from public\.users\s+where staff_role_key = 'admin'\s+and staff_status in \('active', 'pending'\)\s+and jsonb_typeof\(staff_permissions\) = 'array'\s+and not staff_permissions \? new_key;/,
    );
  });

  it("targets only pending Admin invites lacking the key", () => {
    expect(MIGRATION).toMatch(
      /from public\.staff_invites\s+where status = 'pending'\s+and role_key = 'admin'\s+and jsonb_typeof\(permissions\) = 'array'\s+and not permissions \? new_key;/,
    );
  });

  it("never names teachers or other roles", () => {
    expect(SQL_CODE).not.toMatch(/'teacher'|'front_desk'|'read_only'|'custom'/);
  });

  it("updates exactly the backed-up rows, after the backup", () => {
    expect(MIGRATION).toMatch(
      /update public\.users u\s+set staff_permissions = u\.staff_permissions \|\| jsonb_build_array\(new_key\)\s+from public\.staff_permissions_pre_00082 b\s+where b\.user_id = u\.id/,
    );
    expect(MIGRATION).toMatch(
      /update public\.staff_invites i\s+set permissions = i\.permissions \|\| jsonb_build_array\(new_key\)\s+from public\.staff_invites_pre_00082 b\s+where b\.invite_id = i\.id/,
    );
    const firstGrantUpdate = MIGRATION.indexOf("update public.users");
    expect(MIGRATION.indexOf("insert into public.staff_permissions_pre_00082")).toBeLessThan(firstGrantUpdate);
    expect(MIGRATION.indexOf("insert into public.staff_invites_pre_00082")).toBeLessThan(firstGrantUpdate);
  });

  it("runs once and requires 00080", () => {
    expect(MIGRATION).toMatch(
      /if exists \(select 1 from public\.staff_permission_migrations where key = '00082_payments_send_receipt'\) then[\s\S]*?return;/,
    );
    expect(MIGRATION).toMatch(/if not exists \(select 1 from public\.staff_permission_model_marker\) then\s+raise exception/);
    expect(MIGRATION).toMatch(/insert into public\.staff_permission_migrations \(key\) values \('00082_payments_send_receipt'\);\s*end \$\$;/);
  });

  it("new tables are not readable by clients", () => {
    for (const t of [
      "student_subscription_identity_backfill_00082",
      "event_purchase_title_backfill_00082",
      "staff_permission_migrations",
      "staff_permissions_pre_00082",
      "staff_invites_pre_00082",
    ]) {
      expect(MIGRATION).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security;`));
      expect(MIGRATION).toMatch(new RegExp(`revoke all on public\\.${t}\\s+from anon, authenticated;`));
    }
  });
});

describe("00082 — diagnostic", () => {
  it("previews the same grant rows and changes nothing", () => {
    expect(DIAGNOSTIC).toContain("where staff_role_key = 'admin'\n  and staff_status in ('active', 'pending')");
    expect(DIAGNOSTIC).toContain("and not staff_permissions ? 'payments:send_receipt'");
    expect(DIAGNOSTIC).toContain("and not permissions ? 'payments:send_receipt'");
    expect(DIAGNOSTIC.replace(/--.*$/gm, "")).not.toMatch(/\b(update|insert|delete|alter|create|drop|truncate|grant|revoke)\b/i);
  });
});
