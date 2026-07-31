/**
 * Referral discount — Phase 10.
 *
 * Pure helpers describing the business rule "student referral codes
 * grant the referred purchaser 10% off eligible beginner products".
 *
 * The pricing engine consumes {@link isReferralDiscountEligibleProduct}
 * inside its `case "referral"` branch so the eligibility criteria live
 * in exactly one place. Callers (checkout preview, Stripe metadata
 * transit, reception path, admin audit) all route through the engine
 * and inherit the same outcome — no duplicate ad-hoc checks.
 *
 * Business rules (from Zaria's brief):
 *   1. Eligible products are BPM's beginner entry products. Detection
 *      is level-driven, not ID-driven, so a future "Beginners Kizomba"
 *      pass auto-qualifies with no code change:
 *        product.allowedLevels contains at least one "Beginner …"
 *      Products with no `allowedLevels` (e.g. general memberships) are
 *      NEVER eligible.
 *   2. The referral code owner cannot use their own code (self-referral
 *      is blocked by `resolveReferralCode` upstream, but this helper
 *      double-checks so the engine cannot fire for a self-referral).
 *   3. A prior non-rejected referral from the same referrer to the
 *      same referred student/email blocks the discount (also enforced
 *      by `resolveReferralCode`; this validator surfaces the reason).
 *   4. The discount is 10% of the eligible product subtotal, rounded
 *      to the nearest cent (matches the engine's own math for other
 *      percentage rules).
 *
 * Not enforced here (belongs elsewhere):
 *   * whether the referral row itself is created — that's
 *     `applyPendingReferralForPurchase`.
 *   * stacking behaviour vs other discounts — that's the pricing
 *     engine's stackable/priority machinery.
 */
import type { MockStudentReferral } from "@/lib/mock-data";

/** Whole-integer percentage — never a decimal. */
export const REFERRAL_DISCOUNT_PERCENT = 10;

/** Canonical seeded discount-rule id (mock + Supabase seed). */
export const REFERRAL_DISCOUNT_RULE_ID = "dr-referral-beginners-10";

/** Canonical seeded discount-rule code — never shown to the customer. */
export const REFERRAL_DISCOUNT_RULE_CODE = "REFERRAL_BEGINNERS_10";

/** Human label shown in checkout, Stripe line description, receipts. */
export const REFERRAL_DISCOUNT_LABEL = "Referral discount (10%)";

/**
 * Returns true when the product's `allowedLevels` list starts with any
 * `Beginner` string — covers "Beginner 1", "Beginner 2",
 * "Beginner 1 & 2" naming conventions currently in seed. Products with
 * a null / empty `allowedLevels` are never eligible.
 */
export function isReferralDiscountEligibleProduct(
  product: { allowedLevels?: string[] | null } | null | undefined,
): boolean {
  if (!product) return false;
  const levels = product.allowedLevels ?? [];
  if (levels.length === 0) return false;
  return levels.some((l) => typeof l === "string" && l.trim().toLowerCase().startsWith("beginner"));
}

/**
 * 10% of the subtotal, rounded to nearest cent. Never negative; a
 * non-finite input maps to 0 so the caller can safely feed engine
 * output without extra guards.
 */
export function calculateReferralDiscountCents(subtotalCents: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  return Math.round((REFERRAL_DISCOUNT_PERCENT / 100) * subtotalCents);
}

// ── Application-level validator ──────────────────────────────
//
// The pricing engine has its own referral gate (rule active + code
// present + product eligible), but the checkout UI + server actions
// need a single-function answer covering the referral relationship
// itself — self-referral, duplicate referral, unknown code. This
// mirrors `resolveReferralCode` but returns a shape aligned with the
// discount decision instead of the referral-record decision.

export type ReferralDiscountRejectionReason =
  | "no_code"
  | "unknown_code"
  | "self_referral"
  | "already_referred"
  | "product_not_eligible";

export interface ReferralDiscountValidationInput {
  /** Normalised referral code (trimmed, upper-cased). Empty when none. */
  code: string;
  /**
   * Product being purchased — we only need `allowedLevels` today, but
   * accept the whole shape so future rule tweaks (e.g. explicit
   * product-type gates) can extend the type without a signature
   * churn.
   */
  product: { allowedLevels?: string[] | null } | null;
  /** Referrer id resolved from the code (null when the code is unknown). */
  referrerStudentId: string | null;
  /** Purchaser id when known. Guest checkouts pass null. */
  purchaserStudentId: string | null;
  /** Purchaser email when known. Enables email-based dedup for guests. */
  purchaserEmail: string | null;
  /** All existing referral rows the referrer already has. */
  existingReferrals: readonly MockStudentReferral[];
}

export type ReferralDiscountValidationResult =
  | {
      ok: true;
      /** Discount amount in cents for the product's subtotal. */
      amountCents: number;
      /** Product subtotal the discount was calculated against. */
      subtotalCents: number;
      referrerStudentId: string;
    }
  | {
      ok: false;
      reason: ReferralDiscountRejectionReason;
      /** Friendly message; ready to render as-is. */
      message: string;
      /**
       * True when the code itself is a valid, resolvable, non-duplicate
       * referral — but the discount does not apply because the product
       * is not an eligible beginner product. Checkout UI uses this to
       * decide between "recognised but not eligible" and "invalid".
       */
      isReferralValid: boolean;
    };

/**
 * Compose the discount decision from the resolved referral state and
 * the product. Given the same rules that `resolveReferralCode` uses,
 * this ALSO reports whether the discount applies.
 *
 * Deliberately pure — no repository access, no I/O.
 */
export function validateReferralDiscountApplication(
  input: ReferralDiscountValidationInput & {
    subtotalCents: number;
  },
): ReferralDiscountValidationResult {
  const trimmed = (input.code ?? "").trim().toUpperCase();
  if (!trimmed) {
    return {
      ok: false,
      reason: "no_code",
      message: "",
      isReferralValid: false,
    };
  }

  if (!input.referrerStudentId) {
    return {
      ok: false,
      reason: "unknown_code",
      message:
        "We couldn't find that referral code. You can continue without it or check the code and try again.",
      isReferralValid: false,
    };
  }

  if (
    input.purchaserStudentId &&
    input.purchaserStudentId === input.referrerStudentId
  ) {
    return {
      ok: false,
      reason: "self_referral",
      message: "You can't use your own referral code.",
      isReferralValid: false,
    };
  }

  const normalizedEmail = input.purchaserEmail?.trim().toLowerCase() ?? null;
  const duplicate = input.existingReferrals.some((r) => {
    if (r.status === "rejected") return false;
    if (
      input.purchaserStudentId &&
      r.referredStudentId === input.purchaserStudentId &&
      r.referrerStudentId === input.referrerStudentId
    ) {
      return true;
    }
    if (
      normalizedEmail &&
      r.referredEmail &&
      r.referredEmail.trim().toLowerCase() === normalizedEmail &&
      r.referrerStudentId === input.referrerStudentId
    ) {
      return true;
    }
    return false;
  });

  if (duplicate) {
    return {
      ok: false,
      reason: "already_referred",
      message: "This referral has already been recorded.",
      isReferralValid: false,
    };
  }

  if (!isReferralDiscountEligibleProduct(input.product)) {
    return {
      ok: false,
      reason: "product_not_eligible",
      message:
        "Referral code recognised, but the 10% discount only applies to beginner products.",
      isReferralValid: true,
    };
  }

  return {
    ok: true,
    amountCents: calculateReferralDiscountCents(input.subtotalCents),
    subtotalCents: input.subtotalCents,
    referrerStudentId: input.referrerStudentId,
  };
}
