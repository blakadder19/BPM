/**
 * Pure domain helpers for the referral programme (Phase 3 MVP).
 *
 * No IO / no Next.js — safe to import from tests and from client UI.
 *
 * The "reward eligibility threshold" is intentionally configurable so
 * BPM can tweak it without redeploying; the default mirrors Zaria's
 * brief ("3 verified beginners → reward eligible").
 */
import type {
  MockStudentReferral,
  MockReferralReward,
  ReferralStatus,
  ReferralRewardStatus,
  ReferralDiscountKind,
} from "@/lib/mock-data";

export const DEFAULT_REFERRAL_REWARD_THRESHOLD = 3;

/**
 * Bucketed counts for a single referrer.
 * `rewardable` = verified referrals that have NOT been "consumed" by a
 * prior reward, i.e. they can count toward the next reward threshold.
 */
export interface ReferralCounts {
  pending: number;
  verified: number;
  rejected: number;
  rewarded: number;
  total: number;
  /** Total verified count, including those already marked "rewarded". */
  verifiedAllTime: number;
  /** Verified referrals not yet "consumed" by being marked rewarded. */
  rewardable: number;
}

export function summarizeReferrals(
  referrals: readonly MockStudentReferral[],
): ReferralCounts {
  let pending = 0;
  let verified = 0;
  let rejected = 0;
  let rewarded = 0;
  for (const r of referrals) {
    switch (r.status) {
      case "pending":
        pending++;
        break;
      case "verified":
        verified++;
        break;
      case "rejected":
        rejected++;
        break;
      case "rewarded":
        rewarded++;
        break;
    }
  }
  return {
    pending,
    verified,
    rejected,
    rewarded,
    total: pending + verified + rejected + rewarded,
    verifiedAllTime: verified + rewarded,
    rewardable: verified,
  };
}

export interface RewardSummary {
  pending: number;
  approved: number;
  applied: number;
  cancelled: number;
  total: number;
}

export function summarizeRewards(
  rewards: readonly MockReferralReward[],
): RewardSummary {
  let pending = 0;
  let approved = 0;
  let applied = 0;
  let cancelled = 0;
  for (const r of rewards) {
    switch (r.status) {
      case "pending":
        pending++;
        break;
      case "approved":
        approved++;
        break;
      case "applied":
        applied++;
        break;
      case "cancelled":
        cancelled++;
        break;
    }
  }
  return {
    pending,
    approved,
    applied,
    cancelled,
    total: pending + approved + applied + cancelled,
  };
}

/**
 * Returns true if the referrer has enough verified-and-not-yet-rewarded
 * referrals to qualify for a new reward at the given threshold.
 *
 * Intentionally pure: a referrer can be eligible even if they already
 * have a `pending` reward — the caller decides whether to allow stacking.
 */
export function isRewardEligible(
  counts: ReferralCounts,
  threshold: number = DEFAULT_REFERRAL_REWARD_THRESHOLD,
): boolean {
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  return counts.rewardable >= threshold;
}

/**
 * Abuse-prevention check used by the "add referral" path.
 * Returns a human-readable error string when the referral should be
 * blocked, or null when it is allowed to proceed.
 *
 * Rules:
 *   - self-referral is never allowed
 *   - same (referrer, referredStudent) pair may not have an existing
 *     non-rejected referral
 *   - same (referrer, referredEmail) pair may not have an existing
 *     non-rejected referral (case-insensitive)
 */
export function validateReferralCreate(input: {
  referrerStudentId: string;
  referredStudentId: string | null;
  referredEmail: string | null;
  existing: readonly MockStudentReferral[];
}): string | null {
  const { referrerStudentId, referredStudentId, referredEmail, existing } = input;
  if (!referrerStudentId) return "Referrer is required.";
  if (!referredStudentId && !referredEmail) {
    return "Provide either a referred student or a referred email.";
  }
  if (referredStudentId && referrerStudentId === referredStudentId) {
    return "A student cannot refer themselves.";
  }
  const normalizedEmail = referredEmail?.trim().toLowerCase() ?? null;
  for (const r of existing) {
    if (r.referrerStudentId !== referrerStudentId) continue;
    if (r.status === "rejected") continue;
    if (referredStudentId && r.referredStudentId === referredStudentId) {
      return "This beginner has already been referred by this referrer.";
    }
    if (
      normalizedEmail &&
      r.referredEmail &&
      r.referredEmail.toLowerCase() === normalizedEmail
    ) {
      return "This email has already been referred by this referrer.";
    }
  }
  return null;
}

/**
 * Validates a manually entered reward.
 * Used by the admin "create reward" / "edit reward" flows.
 */
export function validateRewardInput(input: {
  discountKind: ReferralDiscountKind;
  discountValue: number;
}): string | null {
  if (!Number.isInteger(input.discountValue) || input.discountValue <= 0) {
    return "Discount value must be a positive whole number.";
  }
  if (input.discountKind === "percentage" && input.discountValue > 100) {
    return "Percentage discounts cannot exceed 100.";
  }
  return null;
}

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  rewarded: "Rewarded",
};

export const REWARD_STATUS_LABELS: Record<ReferralRewardStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  applied: "Applied",
  cancelled: "Cancelled",
};

export function formatReferralReward(reward: MockReferralReward): string {
  if (reward.discountKind === "percentage") return `${reward.discountValue}%`;
  return `€${(reward.discountValue / 100).toFixed(2)}`;
}

// ── Referral-code resolution (Phase 7) ───────────────────────
//
// Used by the checkout referral box and signup flow to validate a
// student-entered code BEFORE creating any DB rows. Pure, no IO — the
// caller resolves the referrer id via the repository and passes it in.

export interface ReferralCodeResolutionInput {
  /** Trimmed, case-insensitive comparison-ready code. */
  code: string;
  /** Resolved referrer id from `findStudentByCode`, or null if unknown. */
  resolvedReferrerId: string | null;
  /** id of the user trying to APPLY the code (purchaser). May be null for guest. */
  applicantStudentId: string | null;
  /** Email of the applicant (lower-cased), for email-only/guest paths. */
  applicantEmail: string | null;
  /** Existing referrals for this referrer (for dedup). */
  existingForReferrer: readonly MockStudentReferral[];
}

export type ReferralCodeResolution =
  | {
      ok: true;
      referrerStudentId: string;
      normalizedCode: string;
    }
  | {
      ok: false;
      code: "not_found" | "self_referral" | "already_referred" | "empty";
      message: string;
    };

/**
 * Pure validator for a referral code applied at checkout / signup.
 *
 * Rules:
 *  - empty code → `empty`
 *  - unknown code → `not_found`
 *  - applicant === referrer → `self_referral`
 *  - this applicant already has a non-rejected referral from the same
 *    referrer (matched by student id OR email) → `already_referred`
 *
 * The friendly UI copy is intentionally identical for `not_found`,
 * `empty`, and unknown-code paths so the box doesn't leak whether a
 * given code exists, while staying clear that the user can still
 * proceed without it.
 */
export function resolveReferralCode(
  input: ReferralCodeResolutionInput,
): ReferralCodeResolution {
  const trimmed = input.code.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "empty",
      message: "Enter a referral code.",
    };
  }
  if (!input.resolvedReferrerId) {
    return {
      ok: false,
      code: "not_found",
      message:
        "We couldn't find that referral code. You can continue without it or check the code and try again.",
    };
  }
  if (
    input.applicantStudentId &&
    input.applicantStudentId === input.resolvedReferrerId
  ) {
    return {
      ok: false,
      code: "self_referral",
      message: "You can't use your own referral code.",
    };
  }
  const normalizedApplicantEmail =
    input.applicantEmail?.trim().toLowerCase() ?? null;
  for (const r of input.existingForReferrer) {
    if (r.status === "rejected") continue;
    if (
      input.applicantStudentId &&
      r.referredStudentId === input.applicantStudentId
    ) {
      return {
        ok: false,
        code: "already_referred",
        message: "This referrer has already referred you.",
      };
    }
    if (
      normalizedApplicantEmail &&
      r.referredEmail &&
      r.referredEmail.toLowerCase() === normalizedApplicantEmail
    ) {
      return {
        ok: false,
        code: "already_referred",
        message: "This referrer has already referred this email.",
      };
    }
  }
  return {
    ok: true,
    referrerStudentId: input.resolvedReferrerId,
    normalizedCode: trimmed.toUpperCase(),
  };
}
