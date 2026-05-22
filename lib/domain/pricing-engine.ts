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
import type { EventProductType, ProductType } from "@/types/domain";

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
  /**
   * Phase 5 — event-ticket-only promo codes. Customer must type the
   * matching `code` at event checkout for this rule to fire. Never
   * applies to subscriptions/memberships. Usage limits (`maxUses`,
   * `oneUsePerEmail`) are enforced by the pricing service layer (not
   * the pure engine) so a single function can stay focused on
   * applicability + amount math.
   */
  "event_promo_code",
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
  /**
   * Phase 2 — event-ticket scope. When non-null the rule is scoped to
   * the listed event_product ids and will be considered for event
   * checkouts. When null the rule never applies to event tickets. A
   * rule may carry BOTH `appliesToProductIds` (subscription scope) AND
   * `appliesToEventProductIds` (event scope) simultaneously — the
   * engine picks whichever applies to the product being priced.
   */
  appliesToEventProductIds: string[] | null;
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
  /**
   * Phase 5 — promo-code controls. Only meaningful for
   * `ruleType === "event_promo_code"`; legacy rules default to safe
   * values (no code required, no usage cap, no per-email limit).
   *
   *   * `requiresCode`     — the customer must type a code that
   *                          (case-insensitively) matches `code`. Engine
   *                          enforces. True for promo-code rules.
   *   * `maxUses`          — null = unlimited. Service-layer counts
   *                          paid+pending event purchases whose frozen
   *                          snapshot references this rule's id and
   *                          rejects further redemptions when the cap
   *                          is reached. Engine ignores.
   *   * `oneUsePerEmail`   — when true, the same student id or the
   *                          same normalised guest email cannot use
   *                          this rule twice. Service-layer enforces.
   *                          Engine ignores.
   */
  requiresCode: boolean;
  maxUses: number | null;
  oneUsePerEmail: boolean;
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

/**
 * Discriminator used by the engine to route a product through the
 * right scope checks. Callers default to `"subscription_product"` for
 * backwards compatibility; event-ticket callers must set it explicitly.
 */
export type PricingEntityKind = "subscription_product" | "event_product";

interface PricingProductBase {
  id: string;
  priceCents: number;
}

export type PricingProduct =
  | (PricingProductBase & {
      entityKind?: "subscription_product";
      productType: ProductType;
    })
  | (PricingProductBase & {
      entityKind: "event_product";
      productType: EventProductType;
    });

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
  /**
   * Phase 5 — customer-typed promo code, if any. Compared
   * case-insensitively against `event_promo_code` rules'  `code`.
   * Required to enable promo-code rules; ignored by every other rule
   * type. `null` / `undefined` means "no code entered".
   */
  promoCode?: string | null;
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

  const entityKind: PricingEntityKind =
    ctx.product.entityKind ?? "subscription_product";
  const isEvent = entityKind === "event_product";

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
    // Phase 2 — scope routing.
    //
    //   * For event-ticket pricing the rule MUST explicitly list the
    //     event_product id in `appliesToEventProductIds`. A null /
    //     empty list means the rule was not designed for events and
    //     is skipped — this preserves the existing "rules without
    //     event scope never apply to events" invariant.
    //   * For subscription pricing, any rule whose ONLY scope is
    //     event-ticket ids is skipped (so admins can author event-
    //     only rules without accidentally discounting memberships).
    //   * Subscription-side `appliesToProductTypes` and
    //     `appliesToProductIds` are only meaningful for subscription
    //     pricing — they are ignored for event tickets.
    if (isEvent) {
      const ids = rule.appliesToEventProductIds;
      if (!ids || ids.length === 0) {
        skip("rule has no event-ticket scope");
        continue;
      }
      if (!ids.includes(ctx.product.id)) {
        skip("event-ticket id not in allow-list");
        continue;
      }
    } else {
      // Promo-code rules are event-only by construction. Skip them on
      // any subscription/membership pricing path so they can never
      // discount a non-event product even if an admin accidentally
      // adds subscription scope.
      if (rule.ruleType === "event_promo_code") {
        skip("promo-code rules only apply to event tickets");
        continue;
      }
      const eventIds = rule.appliesToEventProductIds;
      const subIds = rule.appliesToProductIds;
      const subTypes = rule.appliesToProductTypes;
      const eventOnly =
        eventIds != null &&
        eventIds.length > 0 &&
        (subIds == null || subIds.length === 0) &&
        (subTypes == null || subTypes.length === 0);
      if (eventOnly) {
        skip("rule is event-ticket-only");
        continue;
      }
      if (
        rule.appliesToProductTypes &&
        !rule.appliesToProductTypes.includes(ctx.product.productType as ProductType)
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
    }

    let affiliationId: string | null = null;
    switch (rule.ruleType) {
      case "first_time_purchase": {
        if (isEvent) {
          // Phase 2 deliberately keeps first-time discounts subscription-
          // only — extending the atomic claim store to event purchases is
          // out of scope for this change.
          skip("first-time rules do not apply to event tickets in this phase");
          continue;
        }
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
      case "event_promo_code": {
        // Promo-code rules are event-only (the subscription branch
        // above already skipped them). They never auto-apply: the
        // customer must type a matching code at checkout. Comparison
        // is case-insensitive — we always store codes upper-cased.
        const typed = (ctx.promoCode ?? "").trim().toUpperCase();
        if (!typed) {
          skip("promo code not entered");
          continue;
        }
        if (typed !== rule.code.toUpperCase()) {
          skip("promo code does not match");
          continue;
        }
        break;
      }
    }

    eligible.push({ rule, affiliationId });
  }

  // Sort order:
  //   1. Promo-code rules first (Phase 5) — when the customer types a
  //      matching code we always honour it ahead of any automatic
  //      affiliation discount. This is the documented MVP policy:
  //      collaborator codes take precedence over affiliations and
  //      do not silently stack with them (unless both rules are
  //      explicitly `stackable`).
  //   2. Then descending priority (admin can break ties).
  //   3. Then ascending code (deterministic final tiebreak).
  eligible.sort((a, b) => {
    const aPromo = a.rule.ruleType === "event_promo_code" ? 1 : 0;
    const bPromo = b.rule.ruleType === "event_promo_code" ? 1 : 0;
    if (aPromo !== bPromo) return bPromo - aPromo;
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
    case "event_promo_code":
      return `Promo code ${rule.code}`;
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
