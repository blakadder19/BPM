/**
 * Pricing engine — Phase 4.
 *
 * Pure module: no DB / store / I/O access. Given a product, the student's
 * verified affiliations, the catalogue of active discount rules, and a
 * "first-time" flag, returns the structured pricing decision.
 *
 * Strict design rules:
 *   * No formulas, no DSL, no executable rule content.
 *   * Every rule is a typed enum + numeric fields.
 *   * Output is fully serialisable so it can be frozen on the subscription
 *     row at purchase time (snapshot safety: future rule edits never
 *     retroactively change historical purchases).
 */
import type { ProductType } from "@/types/domain";

// ── Affiliation taxonomy ─────────────────────────────────────

export const AFFILIATION_TYPES = [
  "hse",
  "gardai",
  "language_school",
  "corporate",
  "staff",
  "other",
] as const;
export type AffiliationType = (typeof AFFILIATION_TYPES)[number];

export const AFFILIATION_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "expired",
] as const;
export type AffiliationVerificationStatus =
  (typeof AFFILIATION_VERIFICATION_STATUSES)[number];

export interface StudentAffiliation {
  id: string;
  studentId: string;
  affiliationType: AffiliationType;
  verificationStatus: AffiliationVerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  metadata: Record<string, unknown>;
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Rule taxonomy ────────────────────────────────────────────

export const DISCOUNT_RULE_TYPES = [
  "affiliation",
  "first_time_purchase",
] as const;
export type DiscountRuleType = (typeof DISCOUNT_RULE_TYPES)[number];

export const DISCOUNT_KINDS = ["percentage", "fixed_cents"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export interface DiscountRule {
  id: string;
  code: string;
  name: string;
  description: string | null;
  ruleType: DiscountRuleType;
  affiliationType: AffiliationType | null;
  discountKind: DiscountKind;
  discountValue: number;
  appliesToProductTypes: ProductType[] | null;
  appliesToProductIds: string[] | null;
  minPriceCents: number | null;
  maxDiscountCents: number | null;
  isActive: boolean;
  priority: number;
  stackable: boolean;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Engine inputs / outputs ──────────────────────────────────

export interface PricingProduct {
  id: string;
  productType: ProductType;
  priceCents: number;
}

export interface PricingContext {
  product: PricingProduct;
  /** ISO timestamp; engine uses this when checking validity windows. */
  now: string;
  /** All active+inactive rules; engine filters by isActive + window itself. */
  rules: DiscountRule[];
  /** Verified-or-other affiliation rows for this student. Engine ignores non-verified. */
  studentAffiliations: StudentAffiliation[];
  /** True when the student has zero prior PAID subscriptions. */
  isFirstTimePurchase: boolean;
}

export interface AppliedDiscount {
  ruleId: string;
  code: string;
  name: string;
  ruleType: DiscountRuleType;
  discountKind: DiscountKind;
  discountValue: number;
  amountCents: number;
  affiliationType: AffiliationType | null;
  affiliationId: string | null;
  reason: string;
}

export interface PricingResult {
  basePriceCents: number;
  appliedDiscounts: AppliedDiscount[];
  totalDiscountCents: number;
  finalPriceCents: number;
  reasons: string[];
}

// ── Engine ───────────────────────────────────────────────────

/**
 * Evaluate the pricing decision for a single product purchase.
 *
 * Algorithm (deterministic, auditable):
 *   1. Filter rules to active + within validity window + applicable to
 *      this product (productType + productId allow-lists + min_price gate).
 *   2. For each rule, check eligibility against the student context
 *      (matching verified affiliation, first-time flag, etc.).
 *   3. Sort eligible rules by priority desc, then code asc (deterministic).
 *   4. Iterate; apply the first eligible rule. Apply additional rules
 *      ONLY if both the new rule and ALL already-applied rules have
 *      stackable=true.
 *   5. Final price never goes below 0.
 */
export function applyPricing(ctx: PricingContext): PricingResult {
  const base = ctx.product.priceCents;
  const reasons: string[] = [];
  const applied: AppliedDiscount[] = [];

  if (base <= 0) {
    return {
      basePriceCents: base,
      appliedDiscounts: [],
      totalDiscountCents: 0,
      finalPriceCents: base,
      reasons: ["Base price is zero or negative — no discounts evaluated."],
    };
  }

  const eligible: { rule: DiscountRule; affiliationId: string | null }[] = [];

  for (const rule of ctx.rules) {
    const skip = (why: string) => {
      reasons.push(`Rule ${rule.code} skipped: ${why}`);
    };

    if (!rule.isActive) {
      skip("inactive");
      continue;
    }
    if (rule.validFrom && rule.validFrom > ctx.now) {
      skip("not yet valid");
      continue;
    }
    if (rule.validUntil && rule.validUntil < ctx.now) {
      skip("expired");
      continue;
    }
    if (rule.minPriceCents != null && base < rule.minPriceCents) {
      skip(`base price below min_price_cents (${rule.minPriceCents})`);
      continue;
    }
    if (
      rule.appliesToProductTypes &&
      !rule.appliesToProductTypes.includes(ctx.product.productType)
    ) {
      skip("product type not in allow-list");
      continue;
    }
    if (
      rule.appliesToProductIds &&
      !rule.appliesToProductIds.includes(ctx.product.id)
    ) {
      skip("product id not in allow-list");
      continue;
    }

    let affiliationId: string | null = null;
    switch (rule.ruleType) {
      case "first_time_purchase": {
        if (!ctx.isFirstTimePurchase) {
          skip("student is not first-time");
          continue;
        }
        break;
      }
      case "affiliation": {
        if (!rule.affiliationType) {
          skip("rule misconfigured (affiliation_type required)");
          continue;
        }
        const match = ctx.studentAffiliations.find(
          (a) =>
            a.verificationStatus === "verified" &&
            a.affiliationType === rule.affiliationType &&
            withinAffiliationWindow(a, ctx.now),
        );
        if (!match) {
          skip(`no verified ${rule.affiliationType} affiliation for student`);
          continue;
        }
        affiliationId = match.id;
        break;
      }
    }

    eligible.push({ rule, affiliationId });
  }

  eligible.sort((a, b) => {
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority;
    return a.rule.code.localeCompare(b.rule.code);
  });

  for (const { rule, affiliationId } of eligible) {
    const allowsCombination =
      applied.length === 0 ||
      (rule.stackable && applied.every((a) => isAppliedStackable(a, eligible)));

    if (!allowsCombination) {
      reasons.push(
        `Rule ${rule.code} skipped: not stackable with already-applied rule(s).`,
      );
      continue;
    }

    const remainingBase = base - sumApplied(applied);
    if (remainingBase <= 0) {
      reasons.push(`Rule ${rule.code} skipped: no remaining price to discount.`);
      continue;
    }

    const rawAmount =
      rule.discountKind === "percentage"
        ? Math.round((rule.discountValue / 100) * remainingBase)
        : rule.discountValue;

    const capped =
      rule.maxDiscountCents != null
        ? Math.min(rawAmount, rule.maxDiscountCents)
        : rawAmount;

    const amountCents = Math.max(0, Math.min(capped, remainingBase));

    if (amountCents <= 0) {
      reasons.push(`Rule ${rule.code} skipped: computed discount is zero.`);
      continue;
    }

    const reason = describeReason(rule);
    applied.push({
      ruleId: rule.id,
      code: rule.code,
      name: rule.name,
      ruleType: rule.ruleType,
      discountKind: rule.discountKind,
      discountValue: rule.discountValue,
      amountCents,
      affiliationType: rule.affiliationType,
      affiliationId,
      reason,
    });
    reasons.push(`Rule ${rule.code} applied: -${amountCents} cents (${reason}).`);
  }

  const totalDiscountCents = sumApplied(applied);
  const finalPriceCents = Math.max(0, base - totalDiscountCents);

  return {
    basePriceCents: base,
    appliedDiscounts: applied,
    totalDiscountCents,
    finalPriceCents,
    reasons,
  };
}

// ── Helpers ──────────────────────────────────────────────────

function sumApplied(list: AppliedDiscount[]): number {
  return list.reduce((s, a) => s + a.amountCents, 0);
}

function isAppliedStackable(
  a: AppliedDiscount,
  eligible: { rule: DiscountRule }[],
): boolean {
  const r = eligible.find((e) => e.rule.id === a.ruleId)?.rule;
  return !!r && r.stackable;
}

function withinAffiliationWindow(
  a: StudentAffiliation,
  nowIso: string,
): boolean {
  if (a.validFrom && a.validFrom > nowIso) return false;
  if (a.validUntil && a.validUntil < nowIso) return false;
  return true;
}

function describeReason(rule: DiscountRule): string {
  switch (rule.ruleType) {
    case "first_time_purchase":
      return "First-time purchase";
    case "affiliation":
      return `Verified ${rule.affiliationType ?? "affiliation"}`;
  }
}

// ── Snapshot helpers ─────────────────────────────────────────

/**
 * The exact shape stored in `student_subscriptions.applied_discount` jsonb.
 * Mirrors the engine output minus reasons (which are debug-y) so historical
 * rows stay focused and small.
 */
export interface AppliedDiscountSnapshot {
  appliedAt: string;
  basePriceCents: number;
  totalDiscountCents: number;
  finalPriceCents: number;
  appliedDiscounts: AppliedDiscount[];
}

export function snapshotPricingResult(
  result: PricingResult,
  appliedAt: string,
): AppliedDiscountSnapshot | null {
  if (result.appliedDiscounts.length === 0) return null;
  return {
    appliedAt,
    basePriceCents: result.basePriceCents,
    totalDiscountCents: result.totalDiscountCents,
    finalPriceCents: result.finalPriceCents,
    appliedDiscounts: result.appliedDiscounts.map((a) => ({ ...a })),
  };
}
