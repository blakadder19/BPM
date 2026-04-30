import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
import { getAffiliationRepo, getDiscountRuleRepo } from "@/lib/repositories";
import { cachedGetAllStudents } from "@/lib/server/cached-queries";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AffiliationsClient } from "@/components/affiliations/affiliations-client";

export default async function AffiliationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  await requirePermission("affiliations:view");
  await ensureOperationalDataHydrated();
  const params = searchParams ? await searchParams : {};

  const [affiliations, students, rules, access] = await Promise.all([
    getAffiliationRepo().getAll(),
    cachedGetAllStudents(),
    getDiscountRuleRepo().getActive(),
    getStaffAccess(),
  ]);

  const permissions = {
    canCreate: hasPermission(access, "affiliations:create"),
    canEdit: hasPermission(access, "affiliations:edit"),
    canVerify: hasPermission(access, "affiliations:verify"),
    canDelete: hasPermission(access, "affiliations:delete"),
  };

  const studentRows = students.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    email: s.email,
  }));

  // Surface how many ACTIVE discount rules currently target each
  // affiliation type, so admins can see at a glance whether an
  // affiliation actually unlocks anything for the student.
  const activeRulesByAffiliation: Record<string, number> = {};
  for (const r of rules) {
    if (r.ruleType !== "affiliation" || !r.affiliationType) continue;
    activeRulesByAffiliation[r.affiliationType] =
      (activeRulesByAffiliation[r.affiliationType] ?? 0) + 1;
  }

  return (
    <AffiliationsClient
      affiliations={affiliations.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        affiliationType: a.affiliationType,
        verificationStatus: a.verificationStatus,
        verifiedAt: a.verifiedAt,
        verifiedBy: a.verifiedBy,
        validFrom: a.validFrom,
        validUntil: a.validUntil,
        notes: a.notes,
        metadata: a.metadata,
        createdAt: a.createdAt,
      }))}
      students={studentRows}
      activeRulesByAffiliation={activeRulesByAffiliation}
      initialSearch={params.search ?? ""}
      permissions={permissions}
    />
  );
}
