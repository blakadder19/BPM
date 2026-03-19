/**
 * Member benefits domain logic.
 *
 * Pure functions for determining membership benefit eligibility:
 * - Birthday week free class
 * - Member giveaway eligibility
 * - Free weekend Student Practice access
 */

import { BIRTHDAY_WEEK_DURATION_DAYS } from "@/config/business-rules";
import type { MockSubscription } from "@/lib/mock-data";

/**
 * Returns true if `referenceDate` falls within the 7-day birthday window
 * starting on the student's birthday (same month/day in the reference year).
 */
export function isBirthdayWeek(
  dateOfBirth: string | null,
  referenceDate: string
): boolean {
  if (!dateOfBirth) return false;

  const dob = new Date(dateOfBirth);
  const ref = new Date(referenceDate);

  if (isNaN(dob.getTime()) || isNaN(ref.getTime())) return false;

  const birthdayThisYear = new Date(
    ref.getFullYear(),
    dob.getMonth(),
    dob.getDate()
  );

  const diffMs = ref.getTime() - birthdayThisYear.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays >= 0 && diffDays < BIRTHDAY_WEEK_DURATION_DAYS;
}

/**
 * Returns true if the student has at least one active membership subscription.
 * All membership tiers qualify for giveaway eligibility.
 */
export function isMemberGiveawayEligible(
  subscriptions: MockSubscription[]
): boolean {
  return subscriptions.some(
    (s) => s.productType === "membership" && s.status === "active"
  );
}

/**
 * Returns true if the student has at least one active membership subscription,
 * granting free access to weekend Student Practice sessions.
 */
export function hasFreePracticeAccess(
  subscriptions: MockSubscription[]
): boolean {
  return subscriptions.some(
    (s) => s.productType === "membership" && s.status === "active"
  );
}

export interface MemberBenefitsSummary {
  isMember: boolean;
  birthdayWeekEligible: boolean;
  birthdayFreeClassUsed: boolean;
  giveawayEligible: boolean;
  freePracticeAccess: boolean;
}

/**
 * Computes the full benefits summary for a student.
 */
export function computeMemberBenefits(opts: {
  dateOfBirth: string | null;
  referenceDate: string;
  subscriptions: MockSubscription[];
  birthdayClassUsed: boolean;
}): MemberBenefitsSummary {
  const isMember = opts.subscriptions.some(
    (s) => s.productType === "membership" && s.status === "active"
  );

  const birthdayWeekEligible =
    isMember && isBirthdayWeek(opts.dateOfBirth, opts.referenceDate);

  return {
    isMember,
    birthdayWeekEligible,
    birthdayFreeClassUsed: opts.birthdayClassUsed,
    giveawayEligible: isMember,
    freePracticeAccess: isMember,
  };
}
