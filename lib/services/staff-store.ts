/**
 * In-memory staff store (memory mode only).
 *
 * Mirrors the shape of the new Supabase columns on `public.users` plus
 * a small `staff_invites` table. Seeded with the legacy demo accounts
 * from `lib/auth.ts` so the existing `admin@bpm.dance` is automatically
 * a `super_admin` in dev — preserving "current existing admin keeps
 * full access" without anyone having to flip a switch.
 */
import { isSupabaseMode } from "@/lib/config/data-provider";
import type {
  StaffMember,
  StaffInvite,
  CreateStaffInviteInput,
  UpdateStaffPatch,
} from "@/lib/repositories/interfaces/staff-repository";
import type { Permission, StaffRoleKey, StaffStatus } from "@/lib/domain/permissions";

interface MutableStaff extends StaffMember {}
interface MutableInvite extends StaffInvite {}

let staff: MutableStaff[] = [];
let invites: MutableInvite[] = [];
let initialized = false;

function nowIso() {
  return new Date().toISOString();
}

function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function genToken() {
  // Not cryptographically strong — memory mode only. Real invites use
  // a Supabase-side hash; see migrations/00059_staff_permissions.sql.
  return `tok_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function init() {
  if (initialized) return;
  initialized = true;

  // Memory mode only — Supabase mode reads from the real users table.
  if (isSupabaseMode()) return;

  staff = [
    {
      id: "dev-admin",
      email: "admin@bpm.dance",
      fullName: "Admin User",
      legacyRole: "admin",
      roleKey: "super_admin",
      permissions: [],
      status: "active",
      invitedBy: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    {
      id: "dev-teacher",
      email: "teacher@bpm.dance",
      fullName: "Maria Garcia",
      legacyRole: "teacher",
      roleKey: "teacher",
      permissions: [],
      status: "active",
      invitedBy: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
  invites = [];
}

export function listStaff(): StaffMember[] {
  init();
  return staff.map((s) => ({ ...s, permissions: [...s.permissions] }));
}

export function getStaff(userId: string): StaffMember | null {
  init();
  const row = staff.find((s) => s.id === userId);
  return row ? { ...row, permissions: [...row.permissions] } : null;
}

export function getStaffByEmail(email: string): StaffMember | null {
  init();
  const e = email.toLowerCase();
  const row = staff.find((s) => s.email.toLowerCase() === e);
  return row ? { ...row, permissions: [...row.permissions] } : null;
}

export function updateStaff(userId: string, patch: UpdateStaffPatch): StaffMember | null {
  init();
  const idx = staff.findIndex((s) => s.id === userId);
  if (idx === -1) return null;
  const cur = staff[idx];
  const next: MutableStaff = {
    ...cur,
    roleKey: patch.roleKey !== undefined ? patch.roleKey : cur.roleKey,
    permissions:
      patch.permissions !== undefined ? [...patch.permissions] : [...cur.permissions],
    status: patch.status !== undefined ? patch.status : cur.status,
    updatedAt: nowIso(),
  };
  staff[idx] = next;
  return { ...next, permissions: [...next.permissions] };
}

/**
 * Memory-mode helper used by accept-invite-on-sign-in flow tests.
 * Real Supabase mode does this in the auth callback.
 */
export function upsertStaffFromInvite(
  invite: StaffInvite,
  identity: { id: string; fullName: string; legacyRole: "admin" | "teacher" },
): StaffMember {
  init();
  const existing = staff.find((s) => s.id === identity.id);
  if (existing) {
    existing.roleKey = invite.roleKey;
    existing.permissions = [...invite.permissions];
    existing.status = "active";
    existing.updatedAt = nowIso();
    return { ...existing, permissions: [...existing.permissions] };
  }
  const created: MutableStaff = {
    id: identity.id,
    email: invite.email,
    fullName: identity.fullName,
    legacyRole: identity.legacyRole,
    roleKey: invite.roleKey,
    permissions: [...invite.permissions],
    status: "active",
    invitedBy: invite.invitedBy,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  staff.push(created);
  return { ...created, permissions: [...created.permissions] };
}

export function listInvites(): StaffInvite[] {
  init();
  return invites.map((i) => ({ ...i, permissions: [...i.permissions] }));
}

export function getInvite(id: string): StaffInvite | null {
  init();
  const row = invites.find((i) => i.id === id);
  return row ? { ...row, permissions: [...row.permissions] } : null;
}

export function getPendingInviteByEmail(email: string): StaffInvite | null {
  init();
  const e = email.toLowerCase();
  const row = invites.find(
    (i) => i.email.toLowerCase() === e && i.status === "pending",
  );
  return row ? { ...row, permissions: [...row.permissions] } : null;
}

export function createInvite(input: CreateStaffInviteInput): StaffInvite {
  init();
  // Drop any prior pending invite for the same email — keep things simple
  // and stop the list from growing duplicates if an admin invites twice.
  for (const i of invites) {
    if (i.email.toLowerCase() === input.email.toLowerCase() && i.status === "pending") {
      i.status = "revoked";
    }
  }
  const created: MutableInvite = {
    id: genId("inv"),
    email: input.email.trim(),
    displayName: input.displayName?.trim() ?? null,
    roleKey: input.roleKey,
    permissions: [...input.permissions],
    status: "pending",
    expiresAt: input.expiresAt ?? null,
    createdAt: nowIso(),
    invitedBy: input.invitedBy,
    token: genToken(),
  };
  invites.push(created);
  return { ...created, permissions: [...created.permissions] };
}

export function revokeInvite(id: string): boolean {
  init();
  const idx = invites.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  if (invites[idx].status !== "pending") return false;
  invites[idx] = { ...invites[idx], status: "revoked" };
  return true;
}

export function markInviteAccepted(id: string): boolean {
  init();
  const idx = invites.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  invites[idx] = { ...invites[idx], status: "accepted" };
  return true;
}

/** Test-only — clear all in-memory state. */
export function __resetForTests() {
  staff = [];
  invites = [];
  initialized = false;
}

// Re-export for consumers who only need the StaffStatus / StaffRoleKey
// types alongside this store, without re-routing through the domain layer.
export type { Permission, StaffRoleKey, StaffStatus };
