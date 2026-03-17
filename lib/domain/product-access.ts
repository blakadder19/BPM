/**
 * Pure domain logic for product access checking.
 *
 * Determines whether a given product (via its access rule and subscription
 * selections) grants access to a specific class.
 */

import type { ProductAccessRule } from "@/config/product-access";
import type { ClassType } from "@/types/domain";

export interface AccessClassContext {
  classType: ClassType;
  danceStyleId: string | null;
  level: string | null;
}

export interface AccessCheckResult {
  granted: boolean;
  reason: string;
}

/**
 * Check if a product access rule grants access to a class, given the
 * student's style selection(s) on their subscription.
 *
 * @param rule            The product's access rule
 * @param selectedStyleId The student's chosen style (for selected_style products)
 * @param selectedStyleIds The student's chosen styles (for course_group products)
 * @param classCtx        The target class's attributes
 */
export function canAccessClass(
  rule: ProductAccessRule,
  selectedStyleId: string | null | undefined,
  selectedStyleIds: string[] | null | undefined,
  classCtx: AccessClassContext
): AccessCheckResult {
  if (!rule.allowedClassTypes.includes(classCtx.classType)) {
    return { granted: false, reason: "Product does not cover this class type" };
  }

  if (!checkStyleAccess(rule, selectedStyleId, selectedStyleIds, classCtx)) {
    return { granted: false, reason: "Class style not covered by this product" };
  }

  if (!checkLevelAccess(rule, classCtx)) {
    return { granted: false, reason: "Class level not covered by this product" };
  }

  return { granted: true, reason: "Access granted" };
}

function checkStyleAccess(
  rule: ProductAccessRule,
  selectedStyleId: string | null | undefined,
  selectedStyleIds: string[] | null | undefined,
  classCtx: AccessClassContext
): boolean {
  const sa = rule.styleAccess;

  switch (sa.type) {
    case "all":
      return true;

    case "fixed":
      if (!classCtx.danceStyleId) return false;
      return sa.styleIds.includes(classCtx.danceStyleId);

    case "selected_style":
      if (!selectedStyleId) return false;
      if (!classCtx.danceStyleId) return false;
      return classCtx.danceStyleId === selectedStyleId;

    case "course_group":
      if (!selectedStyleIds || selectedStyleIds.length === 0) return false;
      if (!classCtx.danceStyleId) return false;
      return selectedStyleIds.includes(classCtx.danceStyleId);

    case "social_only":
      return classCtx.classType === "social";
  }
}

function checkLevelAccess(
  rule: ProductAccessRule,
  classCtx: AccessClassContext
): boolean {
  if (!rule.allowedLevels) return true;
  if (!classCtx.level) return true;
  return rule.allowedLevels.includes(classCtx.level);
}
