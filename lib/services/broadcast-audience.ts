import "server-only";

/**
 * Audience resolution for admin broadcasts.
 *
 * Takes an audience type + optional params and returns the matching
 * student IDs + names. All resolution uses the canonical repos
 * (student, subscription) so it works identically in dev and production.
 */

import { getStudentRepo, getSubscriptionRepo } from "@/lib/repositories";
import type { AudienceType, AudienceParams } from "@/lib/domain/broadcast-types";

export type { AudienceType, AudienceParams };

export interface AudienceResult {
  students: { id: string; name: string }[];
}

export async function resolveAudience(
  audienceType: AudienceType,
  params: AudienceParams = {}
): Promise<AudienceResult> {
  const allStudents = await getStudentRepo().getAll();
  const activeStudents = allStudents.filter((s) => s.isActive);

  if (audienceType === "specific_students") {
    const idSet = new Set(params.studentIds ?? []);
    if (idSet.size === 0) return { students: [] };
    return {
      students: activeStudents
        .filter((s) => idSet.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "all_students") {
    return {
      students: activeStudents.map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  const allSubs = await getSubscriptionRepo().getAll();

  if (audienceType === "with_active_subscription") {
    const idsWithActive = new Set(
      allSubs.filter((s) => s.status === "active").map((s) => s.studentId)
    );
    return {
      students: activeStudents
        .filter((s) => idsWithActive.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "with_pending_payment") {
    const idsWithPending = new Set(
      allSubs
        .filter((s) => s.status === "active" && s.paymentStatus === "pending")
        .map((s) => s.studentId)
    );
    return {
      students: activeStudents
        .filter((s) => idsWithPending.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "with_membership") {
    const idsWithMembership = new Set(
      allSubs
        .filter(
          (s) =>
            s.status === "active" &&
            s.totalCredits === null
        )
        .map((s) => s.studentId)
    );
    return {
      students: activeStudents
        .filter((s) => idsWithMembership.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "with_pass") {
    const idsWithPass = new Set(
      allSubs
        .filter(
          (s) =>
            s.status === "active" &&
            s.totalCredits !== null &&
            (s.remainingCredits ?? 0) > 0
        )
        .map((s) => s.studentId)
    );
    return {
      students: activeStudents
        .filter((s) => idsWithPass.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "without_subscription") {
    const idsWithAnySub = new Set(
      allSubs.filter((s) => s.status === "active").map((s) => s.studentId)
    );
    return {
      students: activeStudents
        .filter((s) => !idsWithAnySub.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  return { students: [] };
}

export { AUDIENCE_LABELS } from "@/lib/domain/broadcast-types";
