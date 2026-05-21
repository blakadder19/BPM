import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
import {
  getReferralRepo,
  getSubscriptionRepo,
} from "@/lib/repositories";
import { cachedGetAllStudents } from "@/lib/server/cached-queries";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { ReferralsClient } from "@/components/referrals/referrals-client";
import {
  summarizeReferrals,
  summarizeRewards,
  DEFAULT_REFERRAL_REWARD_THRESHOLD,
  isRewardEligible,
} from "@/lib/domain/referrals";

export default async function ReferralsPage() {
  await requirePermission("referrals:view");
  await ensureOperationalDataHydrated();

  const repo = getReferralRepo();
  const [referrals, rewards, students, codes, access] = await Promise.all([
    repo.getAllReferrals(),
    repo.getAllRewards(),
    cachedGetAllStudents(),
    repo.getAllCodes(),
    getStaffAccess(),
  ]);

  const permissions = {
    canCreate: hasPermission(access, "referrals:create"),
    canVerify: hasPermission(access, "referrals:verify"),
    canReward: hasPermission(access, "referrals:reward"),
    canCancel: hasPermission(access, "referrals:cancel"),
  };

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const codeMap = new Map(codes.map((c) => [c.studentId, c.code]));

  // Build per-referrer rollup for the overview tab. We only show
  // referrers who actually have referrals or rewards — listing every
  // student would be noisy and the per-student code lookup is also
  // available from the Students page.
  const referrerIds = new Set<string>();
  for (const r of referrals) referrerIds.add(r.referrerStudentId);
  for (const r of rewards) referrerIds.add(r.referrerStudentId);

  const overview = Array.from(referrerIds).map((id) => {
    const myReferrals = referrals.filter((r) => r.referrerStudentId === id);
    const myRewards = rewards.filter((r) => r.referrerStudentId === id);
    const counts = summarizeReferrals(myReferrals);
    const rewardCounts = summarizeRewards(myRewards);
    const student = studentMap.get(id);
    return {
      referrerId: id,
      referrerName: student?.fullName ?? "Unknown",
      referrerEmail: student?.email ?? null,
      referralCode: codeMap.get(id) ?? null,
      counts,
      rewardCounts,
      eligible: isRewardEligible(counts, DEFAULT_REFERRAL_REWARD_THRESHOLD),
    };
  });
  overview.sort((a, b) => b.counts.verified - a.counts.verified);

  // Resolve approved-but-not-applied rewards' candidate subscriptions
  // so the "Mark as applied" dialog can offer a sensible default.
  // Keep this cheap — only fetch for referrers with rewards in the
  // 'approved' state.
  const candidatesByReferrer: Record<string, Array<{ id: string; label: string }>> = {};
  const referrersNeedingSubs = new Set(
    rewards
      .filter((r) => r.status === "approved")
      .map((r) => r.referrerStudentId),
  );
  await Promise.all(
    Array.from(referrersNeedingSubs).map(async (sid) => {
      const subs = await getSubscriptionRepo().getByStudent(sid);
      candidatesByReferrer[sid] = subs
        .filter((s) => s.productType === "membership" && s.status !== "cancelled")
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
        .slice(0, 10)
        .map((s) => ({
          id: s.id,
          label: `${s.productName} · ${s.validFrom} → ${s.validUntil}`,
        }));
    }),
  );

  return (
    <ReferralsClient
      referrals={referrals}
      rewards={rewards}
      overview={overview}
      students={students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
      }))}
      candidatesByReferrer={candidatesByReferrer}
      threshold={DEFAULT_REFERRAL_REWARD_THRESHOLD}
      permissions={permissions}
    />
  );
}
