import { headers } from "next/headers";
import { requirePermission } from "@/lib/staff-permissions";
import { getStaffRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { StaffClient, type StaffClientStaffRow, type StaffClientInviteRow } from "@/components/staff/staff-client";
import type { Permission } from "@/lib/domain/permissions";

/**
 * Resolve an absolute origin for invite copy-links. Mirrors the same
 * fallback chain used inside `inviteStaffAction` so the link the
 * admin sees in the pending-invites table matches the one the action
 * generates server-side.
 */
async function resolveBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ??
        (host.includes("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    /* ignore */
  }
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "";
}

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

  const baseUrl = await resolveBaseUrl();

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
