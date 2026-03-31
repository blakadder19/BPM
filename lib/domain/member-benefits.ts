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
 *
 * `dateOfBirth` is stored as "MM-DD" (no year). Legacy "YYYY-MM-DD" values
 * are also accepted for backward compatibility during migration.
 */
export function isBirthdayWeek(
  dateOfBirth: string | null,
  referenceDate: string
): boolean {
  if (!dateOfBirth) return false;

  const ref = new Date(referenceDate);
  if (isNaN(ref.getTime())) return false;

  let month: number;
  let day: number;

  if (/^\d{2}-\d{2}$/.test(dateOfBirth)) {
    const [mm, dd] = dateOfBirth.split("-").map(Number);
    month = mm - 1;
    day = dd;
  } else {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return false;
    month = dob.getMonth();
    day = dob.getDate();
  }

  const birthdayThisYear = new Date(ref.getFullYear(), month, day);
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
  birthdayClassTitle?: string;
  birthdayClassDate?: string;
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
  birthdayClassTitle?: string;
  birthdayClassDate?: string;
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
    birthdayClassTitle: opts.birthdayClassTitle,
    birthdayClassDate: opts.birthdayClassDate,
    giveawayEligible: isMember,
    freePracticeAccess: isMember,
  };
}
