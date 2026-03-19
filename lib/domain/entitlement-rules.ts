/**
 * Pure domain helpers for matching student entitlements to class instances.
 * No side effects, no store access — all data passed as arguments.
 */

import type { ClassType, ProductType } from "@/types/domain";
import type { ProductAccessRule, StyleAccess } from "@/config/product-access";
import type { MockSubscription } from "@/lib/mock-data";
import type { TermLike } from "./term-rules";
import { findTermForDate, isDateInTerm } from "./term-rules";

export interface ClassContext {
  classType: ClassType;
  styleName: string | null;
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
  classStyleName: string | null,
  sub: MockSubscription
): boolean {
  switch (access.type) {
    case "all":
      return true;
    case "fixed":
      return false;
    case "selected_style":
      if (!classStyleName) return false;
      return sub.selectedStyleName === classStyleName;
    case "course_group":
      if (!classStyleName) return false;
      if (sub.selectedStyleNames && sub.selectedStyleNames.length > 0) {
        return sub.selectedStyleNames.includes(classStyleName);
      }
      return access.poolStyleIds.some((id) => {
        return false;
      });
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
  if (!styleMatches(accessRule.styleAccess, cls.styleName, sub)) return false;
  if (!levelMatches(accessRule.allowedLevels, cls.level)) return false;

  if (sub.termId) {
    const term = terms.find((t) => t.startDate <= cls.date && cls.date <= t.endDate);
    if (!term) return false;
    const subTerm = terms.find(
      (t) => t.startDate <= sub.validFrom && sub.validFrom <= t.endDate
    );
    if (!subTerm || subTerm.startDate !== term.startDate) return false;
  }

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
