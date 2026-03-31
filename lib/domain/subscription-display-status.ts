/**
 * Derives an academy-friendly display status for a subscription.
 *
 * Internal statuses (active, paused, expired, exhausted, cancelled) are
 * mapped to user-facing labels that reflect the real reason a product
 * is no longer active:
 *
 *   Active   — currently active
 *   Finished — all credits/classes were fully consumed
 *   Expired  — validity/term ended before all usage was consumed
 *   Cancelled — manually closed before natural completion
 *   Replaced — superseded by a newer active subscription for the same student
 *   Paused   — temporarily suspended
 */

import type { MockSubscription } from "@/lib/mock-data";

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  exhausted: "Finished",
  expired: "Expired",
  cancelled: "Cancelled",
  finished: "Finished",
  replaced: "Replaced",
  renewed: "Renewed",
  renewal: "Renewal",
};

export type DisplayStatus =
  | "active"
  | "paused"
  | "finished"
  | "expired"
  | "cancelled"
  | "replaced"
  | "renewed"
  | "renewal";

/**
 * Given a single subscription and all subscriptions belonging to the same
 * student, return the display-friendly status key.
 *
 * The returned key should be passed to `<StatusBadge status={key} />`.
 */
export function deriveDisplayStatus(
  sub: MockSubscription,
  allStudentSubs: MockSubscription[]
): DisplayStatus {
  // A subscription that was created as a renewal is tagged
  if (sub.status === "active" && sub.renewedFromId) return "renewal";
  if (sub.status === "active") return "active";
  if (sub.status === "paused") return "paused";
  if (sub.status === "cancelled") return "cancelled";

  if (sub.status === "exhausted") {
    return "finished";
  }

  // status === "expired" — decide between Expired, Renewed, or Replaced
  if (sub.status === "expired") {
    const hasRenewalSuccessor = allStudentSubs.some(
      (other) => other.renewedFromId === sub.id
    );
    if (hasRenewalSuccessor) return "renewed";

    const hasActiveReplacement = allStudentSubs.some(
      (other) =>
        other.id !== sub.id &&
        other.studentId === sub.studentId &&
        other.productType === sub.productType &&
        other.status === "active" &&
        other.validFrom > sub.validFrom
    );

    if (hasActiveReplacement) return "replaced";

    return "expired";
  }

  return sub.status as DisplayStatus;
}
