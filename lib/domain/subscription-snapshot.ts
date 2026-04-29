/**
 * Subscription product snapshot — Phase 1 of the no-code admin foundation.
 *
 * Freezes the product/access-rule state at the moment a subscription is
 * created so future admin edits to the live product cannot retroactively
 * change the entitlement of an existing subscription.
 *
 * Pure module — no DB / store access. Snapshots are produced from a live
 * product + access rule and consumed by entitlement evaluation.
 */

import type { ClassType } from "@/types/domain";
import type { ProductAccessRule, StyleAccess } from "@/config/product-access";
import type { MockProduct, MockSubscription, ProductPerks } from "@/lib/mock-data";

// ── Types ────────────────────────────────────────────────────

export type StyleAccessMode = StyleAccess["type"];

/**
 * The frozen-at-purchase product/access state.
 * Mirrors the subset of MockProduct + ProductAccessRule that affects
 * entitlement evaluation. All fields are optional / nullable so legacy
 * rows that pre-date Phase 1 (no snapshot stored) round-trip cleanly.
 */
export interface SubscriptionProductSnapshot {
  /** ISO timestamp of when the snapshot was taken (i.e. when the sub was created). */
  snapshotAt: string;
  /** Product fields */
  allowedStyleIds: string[] | null;
  allowedStyleNames: string[] | null;
  allowedLevels: string[] | null;
  benefits: string[] | null;
  termBound: boolean;
  recurring: boolean;
  spanTerms: number | null;
  /**
   * Frozen per-product perk flags. Null means "use the productType-derived
   * default" (memberships → all on; others → all off). Phase 2 introduced
   * this so admin perk edits cannot retroactively change historical subs.
   */
  perks: ProductPerks | null;
  /** Access-rule fields */
  allowedClassTypes: ClassType[];
  styleAccessMode: StyleAccessMode;
  /** Used only when styleAccessMode === "course_group". */
  styleAccessPickCount: number | null;
  /**
   * For "fixed" mode: the snapshot of the styleIds the rule was bound to.
   * For "course_group": the snapshot of the pool styleIds.
   * For "selected_style": the snapshot of the allowed styleIds the student
   * could pick from. Null for "all" / "social_only".
   */
  styleAccessStyleIds: string[] | null;
  styleAccessStyleNames: string[] | null;
}

// ── Builder ─────────────────────────────────────────────────

/**
 * Build a snapshot from the live product + the live access rule resolved
 * for that product. Both must be passed; if the access rule is missing
 * (e.g. legacy product with no seed rule), a permissive default is used so
 * we never fail to record a snapshot.
 */
export function buildSubscriptionProductSnapshot(
  product: Pick<
    MockProduct,
    | "allowedStyleIds"
    | "allowedStyleNames"
    | "allowedLevels"
    | "benefits"
    | "termBound"
    | "recurring"
    | "spanTerms"
    | "productType"
    | "perks"
  >,
  accessRule: ProductAccessRule | undefined,
): SubscriptionProductSnapshot {
  const sa = accessRule?.styleAccess;

  let mode: StyleAccessMode;
  let pickCount: number | null = null;
  let saIds: string[] | null = null;
  let saNames: string[] | null = null;

  if (!sa) {
    // No rule resolved — fall back to a sane default that mirrors what
    // buildDynamicAccessRulesMap does for an unknown product (fixed when
    // styleIds are present, otherwise all).
    if (product.allowedStyleIds && product.allowedStyleIds.length > 0) {
      mode = "fixed";
      saIds = [...product.allowedStyleIds];
      saNames = product.allowedStyleNames ? [...product.allowedStyleNames] : null;
    } else {
      mode = "all";
    }
  } else {
    mode = sa.type;
    switch (sa.type) {
      case "fixed":
        saIds = [...sa.styleIds];
        saNames = sa.styleNames ? [...sa.styleNames] : (product.allowedStyleNames ?? null);
        break;
      case "course_group":
        saIds = [...sa.poolStyleIds];
        pickCount = sa.pickCount;
        break;
      case "selected_style":
        saIds = sa.allowedStyleIds ? [...sa.allowedStyleIds] : null;
        break;
      case "all":
      case "social_only":
        // no style ids
        break;
    }
  }

  // Default class types: memberships also include student_practice; everything
  // else is class-only. This mirrors today's hardcoded default in
  // buildDynamicAccessRulesMap.
  const allowedClassTypes: ClassType[] = accessRule?.allowedClassTypes
    ? [...accessRule.allowedClassTypes]
    : product.productType === "membership"
      ? ["class", "student_practice"]
      : ["class"];

  return {
    snapshotAt: new Date().toISOString(),
    allowedStyleIds: product.allowedStyleIds ? [...product.allowedStyleIds] : null,
    allowedStyleNames: product.allowedStyleNames ? [...product.allowedStyleNames] : null,
    allowedLevels: product.allowedLevels ? [...product.allowedLevels] : (accessRule?.allowedLevels ?? null),
    benefits: product.benefits ? [...product.benefits] : null,
    termBound: !!product.termBound,
    recurring: !!product.recurring,
    spanTerms: product.spanTerms ?? null,
    perks: product.perks ? { ...product.perks } : null,
    allowedClassTypes,
    styleAccessMode: mode,
    styleAccessPickCount: pickCount,
    styleAccessStyleIds: saIds,
    styleAccessStyleNames: saNames,
  };
}

// ── Resolver ────────────────────────────────────────────────

/**
 * Reconstruct a ProductAccessRule from a snapshot.
 * Used when evaluating entitlement so that admin edits to the live product
 * cannot change the rule a snapshotted subscription operates under.
 */
export function snapshotToAccessRule(
  productId: string,
  snap: SubscriptionProductSnapshot,
): ProductAccessRule {
  let styleAccess: StyleAccess;
  switch (snap.styleAccessMode) {
    case "all":
      styleAccess = { type: "all" };
      break;
    case "social_only":
      styleAccess = { type: "social_only" };
      break;
    case "fixed":
      styleAccess = {
        type: "fixed",
        styleIds: snap.styleAccessStyleIds ?? [],
        ...(snap.styleAccessStyleNames ? { styleNames: snap.styleAccessStyleNames } : {}),
      };
      break;
    case "selected_style":
      styleAccess = {
        type: "selected_style",
        ...(snap.styleAccessStyleIds ? { allowedStyleIds: snap.styleAccessStyleIds } : {}),
      };
      break;
    case "course_group":
      styleAccess = {
        type: "course_group",
        poolStyleIds: snap.styleAccessStyleIds ?? [],
        pickCount: snap.styleAccessPickCount ?? 0,
      };
      break;
  }

  return {
    productId,
    allowedClassTypes: snap.allowedClassTypes,
    styleAccess,
    allowedLevels: snap.allowedLevels,
    isProvisional: false,
    provisionalNote: null,
  };
}

/**
 * Resolve the access rule for a given subscription.
 *
 * - If the subscription has a snapshot, return a rule reconstructed from it
 *   (frozen at purchase time — admin product edits do NOT affect this rule).
 * - Otherwise, fall back to the live access rule from the supplied map.
 *   This preserves backwards compatibility for legacy rows that pre-date
 *   the snapshot rollout.
 */
export function resolveAccessRuleForSubscription(
  sub: Pick<MockSubscription, "productId" | "productSnapshot">,
  liveRulesMap: Map<string, ProductAccessRule>,
): ProductAccessRule | undefined {
  if (sub.productSnapshot) {
    return snapshotToAccessRule(sub.productId, sub.productSnapshot);
  }
  return liveRulesMap.get(sub.productId);
}

/**
 * True when the subscription has a frozen product snapshot.
 * Useful for admin UIs that want to indicate "this subscription's rules
 * are locked in" vs "still derived from the live product".
 */
export function hasProductSnapshot(
  sub: Pick<MockSubscription, "productSnapshot">,
): boolean {
  return !!sub.productSnapshot && !!sub.productSnapshot.snapshotAt;
}
