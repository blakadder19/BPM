import { createAdminClient } from "@/lib/supabase/admin";
import {
  expandPermissions,
  PERMISSION_KEYS,
  type Permission,
  type StaffRoleKey,
  type StaffStatus,
} from "@/lib/domain/permissions";
import type {
  IStaffRepository,
  StaffMember,
  StaffInvite,
  CreateStaffInviteInput,
  UpdateStaffPatch,
} from "../interfaces/staff-repository";

/**
 * Supabase-backed staff repository.
 *
 * The Supabase migration `00059_staff_permissions.sql` adds these
 * columns to `public.users`:
 *   - staff_role_key      text  null
 *   - staff_permissions   jsonb null
 *   - staff_status        text  default 'active'
 *   - staff_updated_at    timestamptz
 *   - staff_invited_by    uuid  null
 * and creates a `public.staff_invites` table.
 *
 * We intentionally do NOT import a generated Database type here —
 * `types/database.ts` will be regenerated separately. The columns are
 * referenced by name and validated at runtime by Postgres, so type
 * drift is contained to this file.
 */

interface UsersRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  staff_role_key: string | null;
  staff_permissions: unknown;
  staff_status: string | null;
  staff_invited_by: string | null;
  staff_updated_at: string | null;
  created_at: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  display_name: string | null;
  role_key: string;
  permissions: unknown;
  status: string;
  expires_at: string | null;
  created_at: string;
  invited_by: string | null;
  token: string;
}

const PERMISSION_SET = new Set<string>(PERMISSION_KEYS);

function sanitizePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) return [];
  const out: Permission[] = [];
  for (const v of value) {
    if (typeof v === "string" && PERMISSION_SET.has(v)) {
      out.push(v as Permission);
    }
  }
  return out;
}

function rowToStaff(row: UsersRow): StaffMember {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    legacyRole: (row.role as "admin" | "teacher" | "student") ?? "student",
    roleKey: (row.staff_role_key as StaffRoleKey | null) ?? null,
    permissions: sanitizePermissions(row.staff_permissions),
    status: ((row.staff_status as StaffStatus | null) ?? "active") as StaffStatus,
    invitedBy: row.staff_invited_by,
    updatedAt: row.staff_updated_at,
    createdAt: row.created_at,
  };
}

function rowToInvite(row: InviteRow): StaffInvite {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roleKey: row.role_key as StaffRoleKey,
    permissions: sanitizePermissions(row.permissions),
    status: row.status as StaffInvite["status"],
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    invitedBy: row.invited_by,
    token: row.token,
  };
}

const STAFF_SELECT =
  "id,email,full_name,role,staff_role_key,staff_permissions,staff_status,staff_invited_by,staff_updated_at,created_at";

export const supabaseStaffRepo: IStaffRepository = {
  async listStaff() {
    const supabase = createAdminClient();
    // Filter out demo-cleanup rows produced by migration 00061: those
    // have `staff_role_key = NULL` AND `staff_status = 'disabled'` and
    // should disappear from /staff. Real disabled staff keep their
    // `staff_role_key` set, so they still appear with a Disabled badge.
    const { data, error } = await supabase
      .from("users")
      .select(STAFF_SELECT)
      .in("role", ["admin", "teacher"] as never)
      .or("staff_role_key.not.is.null,staff_status.neq.disabled")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as UsersRow[]).map(rowToStaff);
  },

  async getStaff(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("users")
      .select(STAFF_SELECT)
      .eq("id", id)
      .maybeSingle();
    return data ? rowToStaff(data as unknown as UsersRow) : null;
  },

  async getStaffByEmail(email) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("users")
      .select(STAFF_SELECT)
      .ilike("email", email)
      .maybeSingle();
    return data ? rowToStaff(data as unknown as UsersRow) : null;
  },

  async updateStaff(id, patch: UpdateStaffPatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = { staff_updated_at: new Date().toISOString() };
    if (patch.roleKey !== undefined) fields.staff_role_key = patch.roleKey;
    if (patch.permissions !== undefined) {
      // Normalize: super_admin shouldn't carry a per-row override —
      // expandPermissions ignores it and storing a long list is noise.
      fields.staff_permissions =
        patch.roleKey === "super_admin" ? null : patch.permissions;
    }
    if (patch.status !== undefined) fields.staff_status = patch.status;
    if (patch.fullName !== undefined) {
      // `public.users.full_name` is the canonical display name column —
      // sidebar, finance BY column, and identityMap all read it.
      fields.full_name = patch.fullName;
    }

    const { error } = await supabase
      .from("users")
      .update(fields as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return this.getStaff(id);
  },

  async listInvites() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("staff_invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as InviteRow[]).map(rowToInvite);
  },

  async getInvite(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("staff_invites")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? rowToInvite(data as unknown as InviteRow) : null;
  },

  async getPendingInviteByEmail(email) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("staff_invites")
      .select("*")
      .ilike("email", email)
      .eq("status", "pending")
      .maybeSingle();
    return data ? rowToInvite(data as unknown as InviteRow) : null;
  },

  async createInvite(input: CreateStaffInviteInput) {
    const supabase = createAdminClient();
    // Soft-revoke any prior pending invite for the same email before
    // inserting a new one so the UI shows a single active row.
    await supabase
      .from("staff_invites")
      .update({ status: "revoked" } as never)
      .ilike("email", input.email)
      .eq("status", "pending");

    const token = `tok_${crypto.randomUUID().replace(/-/g, "")}`;
    const { data, error } = await supabase
      .from("staff_invites")
      .insert({
        email: input.email.trim(),
        display_name: input.displayName?.trim() ?? null,
        role_key: input.roleKey,
        permissions: input.roleKey === "super_admin" ? [] : input.permissions,
        status: "pending",
        expires_at: input.expiresAt ?? null,
        invited_by: input.invitedBy,
        token,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return rowToInvite(data as unknown as InviteRow);
  },

  async revokeInvite(id) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("staff_invites")
      .update({ status: "revoked" } as never)
      .eq("id", id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return true;
  },

  async markInviteAccepted(id) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("staff_invites")
      .update({ status: "accepted" } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};

// Helper kept here so it can be unit-tested alongside row decoding.
export function _resolveEffectivePermissions(
  roleKey: StaffRoleKey | null,
  override: Permission[] | null,
): Set<Permission> {
  return expandPermissions(roleKey, override);
}
