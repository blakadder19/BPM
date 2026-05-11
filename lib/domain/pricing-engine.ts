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

/**
 * Per-rule "what counts as first-time" scope.
 *
 *   * "any_purchase"      — first purchase of ANY product (legacy semantics).
 *   * "selected_products" — first purchase of one of the rule's explicit
 *                           `firstTimeProductIds`. Other purchases neither
 *                           receive nor consume the rule's claim.
 *
 * Levels / product-types may be added later — the engine treats unknown
 * values defensively (no scope match → not eligible).
 */
export const FIRST_TIME_SCOPES = [
  "any_purchase",
  "selected_products",
] as const;
export type FirstTimeScope = (typeof FIRST_TIME_SCOPES)[number];

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
  /**
   * Only meaningful for `ruleType === "first_time_purchase"`. Defaults
   * to `"any_purchase"` for safe back-compat.
   */
  firstTimeScope: FirstTimeScope;
  /**
   * When `firstTimeScope === "selected_products"`, the explicit list of
   * eligible product ids. A purchase outside this list neither receives
   * the discount nor consumes the rule's claim.
   */
  firstTimeProductIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Returns true when `product` falls inside `rule`'s first-time scope.
 * Always true for non-first-time rules — callers should not invoke this
 * on those.
 */
export function productMatchesFirstTimeScope(
  rule: Pick<DiscountRule, "ruleType" | "firstTimeScope" | "firstTimeProductIds">,
  product: Pick<PricingProduct, "id">,
): boolean {
  if (rule.ruleType !== "first_time_purchase") return true;
  const scope = rule.firstTimeScope ?? "any_purchase";
  switch (scope) {
    case "any_purchase":
      return true;
    case "selected_products":
      return (rule.firstTimeProductIds ?? []).includes(product.id);
    default:
      return false;
  }
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
  /**
   * Per-rule first-time eligibility. Keys are `DiscountRule.id`; the
   * value is `true` when the student has NOT yet consumed that
   * specific first-time rule's claim AND no prior in-scope purchase
   * was made.
   *
   * Engine treats a missing key as `false` (deny-by-default).
   */
  firstTimeEligibleByRuleId: Record<string, boolean>;
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
        // First-time eligibility is two questions:
        //   1) does THIS product fall within the rule's first-time scope?
        //   2) has the student already consumed THIS rule's claim?
        // Both must hold for the rule to fire. The scope check happens
        // first so a non-eligible product can never accidentally
        // consume a first-time claim downstream.
        if (!productMatchesFirstTimeScope(rule, ctx.product)) {
          skip("product not in first-time scope");
          continue;
        }
        if (!ctx.firstTimeEligibleByRuleId?.[rule.id]) {
          skip("student already consumed this first-time rule");
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
