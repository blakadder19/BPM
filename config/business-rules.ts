import type { ProductType } from "@/types/domain";

/**
 * Static defaults for business rules.
 * At runtime these should be overridden by the `business_rules` DB table
 * so admins can tune them without redeploying.
 */

export const LATE_CANCEL_FEE_CENTS = 200;
export const NO_SHOW_FEE_CENTS = 500;

/** Cancellations within this window before class start incur a late fee. */
export const LATE_CANCEL_CUTOFF_MINUTES = 60;

/** PROVISIONAL — priority may change after academy confirmation. */
export const CREDIT_DEDUCTION_PRIORITY: ProductType[] = [
  "pass",
  "drop_in",
  "membership",
];

/**
 * Maximum difference between leader and follower counts before
 * additional bookings of the over-represented role are waitlisted.
 * 0 = strict balance, 2 = allow up to 2 more of one role.
 * PROVISIONAL — configurable per academy.
 */
export const ALLOWED_ROLE_IMBALANCE = 2;

/**
 * No-show penalties are OFF by default per academy decision.
 * The architecture is preserved for later reintroduction via Settings page.
 */

/** PROVISIONAL — whether Student Practice events are bookable. */
export const STUDENT_PRACTICE_IS_BOOKABLE = false;

/** PROVISIONAL — hours before a waitlist offer expires. */
export const WAITLIST_OFFER_EXPIRY_HOURS = 4;

/** Birthday week: number of days the birthday free-class window is open. */
export const BIRTHDAY_WEEK_DURATION_DAYS = 7;

/**
 * Standard membership benefits — all membership tiers include these.
 * Used for display and eligibility checks.
 */
export const MEMBERSHIP_BENEFITS = [
  "Birthday week free class",
  "Member giveaways",
  "Free weekend Student Practice",
] as const;
