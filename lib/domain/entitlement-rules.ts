/**
 * Pure domain helpers for matching student entitlements to class instances.
 * No side effects, no store access — all data passed as arguments.
 */

import type { ClassType, ProductType } from "@/types/domain";
import type { ProductAccessRule, StyleAccess } from "@/config/product-access";
import type { MockSubscription } from "@/lib/mock-data";
import type { TermLike } from "./term-rules";

export interface ClassContext {
  classType: ClassType;
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  date: string;
}

export interface ValidEntitlement {
  subscriptionId: string;
  productName: string;
  productType: ProductType;
  description: string;
  classesUsed: number;
  classesPerTerm: number | null;
  remainingCredits: number | null;
  totalCredits: number | null;
}

function styleMatches(
  access: StyleAccess,
  cls: ClassContext,
  sub: MockSubscription
): boolean {
  switch (access.type) {
    case "all":
      return true;
    case "fixed":
      if (cls.styleId) return access.styleIds.includes(cls.styleId);
      if (!cls.styleName) return false;
      return false;
    case "selected_style":
      if (!cls.styleName && !cls.styleId) return false;
      if (cls.styleId && sub.selectedStyleId) {
        return cls.styleId === sub.selectedStyleId;
      }
      if (cls.styleId && sub.selectedStyleIds) {
        return sub.selectedStyleIds.includes(cls.styleId);
      }
      if (sub.selectedStyleName === cls.styleName) return true;
      if (sub.selectedStyleNames && cls.styleName && sub.selectedStyleNames.includes(cls.styleName)) return true;
      return false;
    case "course_group":
      if (!cls.styleName && !cls.styleId) return false;
      if (cls.styleId && sub.selectedStyleIds && sub.selectedStyleIds.length > 0) {
        return sub.selectedStyleIds.includes(cls.styleId);
      }
      if (sub.selectedStyleNames && sub.selectedStyleNames.length > 0 && cls.styleName) {
        return sub.selectedStyleNames.includes(cls.styleName);
      }
      return false;
    case "social_only":
      return false;
  }
}

function levelMatches(
  allowedLevels: string[] | null,
  classLevel: string | null
): boolean {
  if (!allowedLevels) return true;
  if (!classLevel) return true;
  return allowedLevels.includes(classLevel);
}

function classTypeMatches(
  allowedClassTypes: ClassType[],
  classType: ClassType
): boolean {
  return allowedClassTypes.includes(classType);
}

function hasRemainingUsage(sub: MockSubscription): boolean {
  if (sub.productType === "membership" && sub.classesPerTerm !== null) {
    return sub.classesUsed < sub.classesPerTerm;
  }
  if (sub.remainingCredits !== null) {
    return sub.remainingCredits > 0;
  }
  return true;
}

export function isEntitlementValidForClass(
  sub: MockSubscription,
  cls: ClassContext,
  terms: TermLike[],
  accessRule: ProductAccessRule | undefined
): boolean {
  if (sub.status !== "active") return false;
  if (!hasRemainingUsage(sub)) return false;
  if (!accessRule) return false;
  if (!classTypeMatches(accessRule.allowedClassTypes, cls.classType)) return false;
  if (!styleMatches(accessRule.styleAccess, cls, sub)) return false;
  if (!levelMatches(accessRule.allowedLevels, cls.level)) return false;

  // PROVISIONAL: Subscription-to-term matching is disabled for now.
  // The class-level term gate (bookability step 6) already handles lifecycle
  // restrictions for term-bound classes. Product-specific term restrictions
  // (e.g., "this subscription only covers Spring Term") will be re-enabled
  // in a future phase once the academy's product model is finalised.

  return true;
}

export function getValidEntitlements(
  subscriptions: MockSubscription[],
  cls: ClassContext,
  terms: TermLike[],
  accessRulesMap: Map<string, ProductAccessRule>
): ValidEntitlement[] {
  return subscriptions
    .filter((sub) =>
      isEntitlementValidForClass(sub, cls, terms, accessRulesMap.get(sub.productId))
    )
    .map((sub) => toValidEntitlement(sub));
}

/**
 * When getValidEntitlements returns empty, diagnose why.
 * Returns a student-facing reason explaining the block.
 */
export function diagnoseNoEntitlement(
  subscriptions: MockSubscription[],
  cls: ClassContext,
  accessRulesMap: Map<string, ProductAccessRule>
): string {
  if (subscriptions.length === 0) {
    return "You don't have an active membership or pass. Browse the Catalog or visit reception to get started.";
  }

  let anyExhausted = false;
  let anyStyleMismatch = false;
  let anyLevelMismatch = false;
  let anyTypeMismatch = false;
  let exhaustedName: string | null = null;

  for (const sub of subscriptions) {
    const rule = accessRulesMap.get(sub.productId);

    if (!rule) continue;
    if (!classTypeMatches(rule.allowedClassTypes, cls.classType)) {
      anyTypeMismatch = true;
      continue;
    }
    if (!styleMatches(rule.styleAccess, cls, sub)) {
      anyStyleMismatch = true;
      continue;
    }
    if (!levelMatches(rule.allowedLevels, cls.level)) {
      anyLevelMismatch = true;
      continue;
    }
    if (!hasRemainingUsage(sub)) {
      anyExhausted = true;
      exhaustedName = sub.productName;
      continue;
    }
  }

  if (anyExhausted && exhaustedName) {
    return `${exhaustedName}: all classes/credits used. Upgrade or purchase a top-up.`;
  }
  if (anyStyleMismatch) {
    const styleLabel = cls.styleName ?? "this style";
    return `Your current plan doesn't cover ${styleLabel} classes.`;
  }
  if (anyLevelMismatch) {
    const levelLabel = cls.level ?? "this level";
    return `Your current plan doesn't include ${levelLabel} classes.`;
  }
  if (anyTypeMismatch) {
    return "Your current plan doesn't include this type of class.";
  }
  return "No matching entitlement for this class.";
}

export function toValidEntitlement(sub: MockSubscription): ValidEntitlement {
  return {
    subscriptionId: sub.id,
    productName: sub.productName,
    productType: sub.productType,
    description: describeEntitlement(sub),
    classesUsed: sub.classesUsed,
    classesPerTerm: sub.classesPerTerm,
    remainingCredits: sub.remainingCredits,
    totalCredits: sub.totalCredits,
  };
}

export function describeEntitlement(sub: MockSubscription): string {
  if (sub.productType === "membership" && sub.classesPerTerm !== null) {
    const remaining = sub.classesPerTerm - sub.classesUsed;
    return `${sub.productName} — ${remaining} of ${sub.classesPerTerm} classes left`;
  }
  if (sub.productType === "drop_in") {
    return `${sub.productName} — ${sub.remainingCredits ?? 0} use`;
  }
  if (sub.remainingCredits !== null) {
    return `${sub.productName} — ${sub.remainingCredits} credits left`;
  }
  return sub.productName;
}
