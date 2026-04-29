import type { Permission, StaffRoleKey, StaffStatus } from "@/lib/domain/permissions";

/**
 * Staff member as projected from `public.users` + the new
 * `staff_role_key` / `staff_permissions` / `staff_status` columns.
 *
 * `permissions` is the OVERRIDE list stored on the row, NOT the
 * resolved permission set. To get the resolved set callers should
 * use `expandPermissions(roleKey, permissions)` from the domain layer.
 */
export interface StaffMember {
  id: string;
  email: string;
  fullName: string;
  legacyRole: "admin" | "teacher" | "student";
  roleKey: StaffRoleKey | null;
  permissions: Permission[];
  status: StaffStatus;
  invitedBy: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

export interface StaffInvite {
  id: string;
  email: string;
  displayName: string | null;
  roleKey: StaffRoleKey;
  permissions: Permission[];
  status: "pending" | "accepted" | "expired" | "revoked";
  expiresAt: string | null;
  createdAt: string;
  invitedBy: string | null;
  /** Opaque token; only returned at creation so the inviter can copy the link. */
  token: string;
}

export interface CreateStaffInviteInput {
  email: string;
  displayName: string | null;
  roleKey: StaffRoleKey;
  permissions: Permission[];
  invitedBy: string;
  expiresAt?: string | null;
}

export interface UpdateStaffPatch {
  roleKey?: StaffRoleKey | null;
  permissions?: Permission[];
  status?: StaffStatus;
}

export interface IStaffRepository {
  /**
   * List staff = users whose legacyRole is `admin` or `teacher`.
   * Students are not staff and are filtered out at this layer.
   */
  listStaff(): Promise<StaffMember[]>;
  getStaff(userId: string): Promise<StaffMember | null>;
  /** Look up by email (case-insensitive). */
  getStaffByEmail(email: string): Promise<StaffMember | null>;
  updateStaff(userId: string, patch: UpdateStaffPatch): Promise<StaffMember | null>;

  listInvites(): Promise<StaffInvite[]>;
  getInvite(id: string): Promise<StaffInvite | null>;
  /** Look up a pending invite by email (case-insensitive). */
  getPendingInviteByEmail(email: string): Promise<StaffInvite | null>;
  createInvite(input: CreateStaffInviteInput): Promise<StaffInvite>;
  revokeInvite(id: string): Promise<boolean>;
  /**
   * Mark an invite as accepted. Used by the auth callback when a user
   * signs in with the invited email — the staff_role_key + permissions
   * from the invite are written onto their `users` row at the same
   * time (caller's responsibility, kept separate from this method).
   */
  markInviteAccepted(id: string): Promise<boolean>;
}
