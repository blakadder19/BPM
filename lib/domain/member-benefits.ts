/**
 * Member benefits domain logic.
 *
 * Pure functions for determining membership benefit eligibility:
 * - Birthday week free class
 * - Member giveaway eligibility
 * - Free weekend Student Practice access
 */

import type { MockSubscription, ProductPerks } from "@/lib/mock-data";

// ── Per-subscription perk resolution ───────────────────────────
// Phase 2: per-product structured perk flags can override the
// productType-derived default. Legacy subscriptions (no snapshot,
// or snapshot with perks === null) keep the pre-existing behaviour:
// memberships get all three perks, everything else gets none.

const ALL_PERKS_ON: Required<ProductPerks> = {
  birthdayFreeClass: true,
  freeWeekendPractice: true,
  memberGiveaway: true,
};
const ALL_PERKS_OFF: Required<ProductPerks> = {
  birthdayFreeClass: false,
  freeWeekendPractice: false,
  memberGiveaway: false,
};

/**
 * Effective perks for a subscription. Reads from the snapshot when present
 * (frozen at purchase), otherwise derives from productType for legacy rows.
 */
export function effectiveSubscriptionPerks(
  sub: Pick<MockSubscription, "productType" | "productSnapshot">,
): Required<ProductPerks> {
  const snapPerks = sub.productSnapshot?.perks ?? null;
  if (snapPerks) {
    return {
      birthdayFreeClass: snapPerks.birthdayFreeClass ?? false,
      freeWeekendPractice: snapPerks.freeWeekendPractice ?? false,
      memberGiveaway: snapPerks.memberGiveaway ?? false,
    };
  }
  return sub.productType === "membership" ? ALL_PERKS_ON : ALL_PERKS_OFF;
}

/**
 * Parse a date-of-birth string into 0-indexed month and day.
 * Accepts "MM-DD" (preferred) or "YYYY-MM-DD" (legacy).
 */
function parseBirthday(dateOfBirth: string): { month: number; day: number } | null {
  if (/^\d{2}-\d{2}$/.test(dateOfBirth)) {
    const [mm, dd] = dateOfBirth.split("-").map(Number);
    return { month: mm - 1, day: dd };
  }
  const dob = new Date(dateOfBirth + "T12:00:00Z");
  if (isNaN(dob.getTime())) return null;
  return { month: dob.getUTCMonth(), day: dob.getUTCDate() };
}

/**
 * Returns the Mon–Sun calendar week (as YYYY-MM-DD strings) that contains
 * the student's birthday in the same year as `referenceDate`.
 *
 * The academy week runs Monday → Sunday, matching the rest of the
 * scheduling/calendar logic.
 */
export function getBirthdayWeekRange(
  dateOfBirth: string | null,
  referenceDate: string
): { monday: string; sunday: string } | null {
  if (!dateOfBirth) return null;
  const parsed = parseBirthday(dateOfBirth);
  if (!parsed) return null;

  const refYear = parseInt(referenceDate.slice(0, 4), 10);
  if (isNaN(refYear)) return null;

  const birthday = new Date(Date.UTC(refYear, parsed.month, parsed.day, 12));
  if (isNaN(birthday.getTime())) return null;

  const dow = birthday.getUTCDay(); // 0=Sun … 6=Sat
  const daysFromMonday = dow === 0 ? 6 : dow - 1;

  const monday = new Date(birthday);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);

  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  return {
    monday: monday.toISOString().slice(0, 10),
    sunday: sunday.toISOString().slice(0, 10),
  };
}

/**
 * Returns true if `referenceDate` falls within the Mon–Sun calendar week
 * that contains the student's birthday (same month/day in the reference year).
 *
 * `dateOfBirth` is stored as "MM-DD" (no year). Legacy "YYYY-MM-DD" values
 * are also accepted for backward compatibility.
 */
export function isBirthdayWeek(
  dateOfBirth: string | null,
  referenceDate: string
): boolean {
  const range = getBirthdayWeekRange(dateOfBirth, referenceDate);
  if (!range) return false;
  return referenceDate >= range.monday && referenceDate <= range.sunday;
}

function isCurrentlyValid(s: MockSubscription, referenceDate: string): boolean {
  return (
    s.status === "active" &&
    s.validFrom <= referenceDate &&
    (!s.validUntil || s.validUntil >= referenceDate)
  );
}

/**
 * Returns true if the student has at least one currently-valid subscription
 * whose effective perks include `memberGiveaway`. Phase 2: per-product flag
 * with productType-derived fallback for legacy rows.
 */
export function isMemberGiveawayEligible(
  subscriptions: MockSubscription[],
  referenceDate: string
): boolean {
  return subscriptions.some(
    (s) =>
      isCurrentlyValid(s, referenceDate) &&
      effectiveSubscriptionPerks(s).memberGiveaway
  );
}

/**
 * Returns true if the student has at least one currently-valid subscription
 * whose effective perks include `freeWeekendPractice`. Phase 2: per-product
 * flag with productType-derived fallback for legacy rows.
 */
export function hasFreePracticeAccess(
  subscriptions: MockSubscription[],
  referenceDate: string
): boolean {
  return subscriptions.some(
    (s) =>
      isCurrentlyValid(s, referenceDate) &&
      effectiveSubscriptionPerks(s).freeWeekendPractice
  );
}

// ── Single source of truth for birthday benefit eligibility ──

export interface BirthdayBenefitEligibility {
  /**
   * Student has an active membership + dateOfBirth + not already used.
   * Used by /classes and booking action — per-class date check is separate.
   */
  potentiallyEligible: boolean;
  /**
   * potentiallyEligible AND today falls within the Mon-Sun birthday week.
   * Used by notification lifecycle (show/create/hide).
   */
  currentlyActive: boolean;
  alreadyUsed: boolean;
  membershipSubscriptionId: string | null;
  weekRange: { monday: string; sunday: string } | null;
}

/**
 * Canonical eligibility check used by layout, dashboard, classes, and booking.
 * Accepts subscriptions of any status — filters internally.
 */
export function checkBirthdayBenefitEligibility(opts: {
  subscriptions: ReadonlyArray<{
    id: string;
    productType: string;
    status: string;
    productSnapshot?: MockSubscription["productSnapshot"];
  }>;
  dateOfBirth: string | null;
  referenceDate: string;
  alreadyUsedThisYear: boolean;
}): BirthdayBenefitEligibility {
  const result: BirthdayBenefitEligibility = {
    potentiallyEligible: false,
    currentlyActive: false,
    alreadyUsed: opts.alreadyUsedThisYear,
    membershipSubscriptionId: null,
    weekRange: null,
  };

  if (!opts.dateOfBirth) return result;

  // Phase 2: prefer subscriptions whose effective perks include
  // birthdayFreeClass. Legacy subs (no snapshot) fall back to productType.
  const activeMembership = opts.subscriptions.find((s) => {
    if (s.status !== "active") return false;
    return effectiveSubscriptionPerks(
      s as Pick<MockSubscription, "productType" | "productSnapshot">,
    ).birthdayFreeClass;
  });
  if (!activeMembership) return result;

  result.membershipSubscriptionId = activeMembership.id;
  result.potentiallyEligible = !opts.alreadyUsedThisYear;

  const range = getBirthdayWeekRange(opts.dateOfBirth, opts.referenceDate);
  result.weekRange = range;

  if (range && opts.referenceDate >= range.monday && opts.referenceDate <= range.sunday) {
    result.currentlyActive = !opts.alreadyUsedThisYear;
  }

  return result;
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
  // "isMember" preserves the original semantic — any active membership tier
  // grants member status (used to gate the benefits card itself). Specific
  // perk flags below decide which individual benefits the student actually
  // gets.
  const isMember = opts.subscriptions.some(
    (s) => s.productType === "membership" && isCurrentlyValid(s, opts.referenceDate)
  );

  const birthdayPerkActive = opts.subscriptions.some(
    (s) =>
      isCurrentlyValid(s, opts.referenceDate) &&
      effectiveSubscriptionPerks(s).birthdayFreeClass,
  );
  const birthdayWeekEligible =
    birthdayPerkActive && isBirthdayWeek(opts.dateOfBirth, opts.referenceDate);

  return {
    isMember,
    birthdayWeekEligible,
    birthdayFreeClassUsed: opts.birthdayClassUsed,
    birthdayClassTitle: opts.birthdayClassTitle,
    birthdayClassDate: opts.birthdayClassDate,
    giveawayEligible: isMemberGiveawayEligible(opts.subscriptions, opts.referenceDate),
    freePracticeAccess: hasFreePracticeAccess(opts.subscriptions, opts.referenceDate),
  };
}
