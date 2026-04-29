import { requirePermission } from "@/lib/staff-permissions";
import { getStaffRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { StaffClient, type StaffClientStaffRow, type StaffClientInviteRow } from "@/components/staff/staff-client";
import type { Permission } from "@/lib/domain/permissions";

export default async function StaffPage() {
  const access = await requirePermission("staff:view");
  await ensureOperationalDataHydrated();

  const repo = getStaffRepo();
  const [staff, invites] = await Promise.all([repo.listStaff(), repo.listInvites()]);

  const staffRows: StaffClientStaffRow[] = staff.map((s) => ({
    id: s.id,
    email: s.email,
    fullName: s.fullName,
    legacyRole: s.legacyRole,
    roleKey: s.roleKey,
    permissions: s.permissions as Permission[],
    status: s.status,
    invitedBy: s.invitedBy,
    updatedAt: s.updatedAt,
    createdAt: s.createdAt,
    isCurrentUser: s.id === access.user.id,
  }));

  const inviteRows: StaffClientInviteRow[] = invites
    .filter((i) => i.status === "pending")
    .map((i) => ({
      id: i.id,
      email: i.email,
      displayName: i.displayName,
      roleKey: i.roleKey,
      permissions: i.permissions as Permission[],
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      token: i.token,
    }));

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";

  return (
    <StaffClient
      staff={staffRows}
      invites={inviteRows}
      currentUserId={access.user.id}
      currentIsSuperAdmin={access.isSuperAdmin}
      isLegacyAdminFallback={access.isLegacyAdminFallback}
      baseUrl={baseUrl}
    />
  );
}
