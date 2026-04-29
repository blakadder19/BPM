/**
 * Pure domain logic for credit/subscription resolution.
 * Determines which subscription to use when a student books a class.
 *
 * Two resolution paths:
 *   1. Access-rule-based (preferred) — uses ProductAccessRule from config
 *   2. Legacy style/level matching — fallback for callers without rules
 *
 * PROVISIONAL: deduction priority may change after academy confirmation.
 */

import { CREDIT_DEDUCTION_PRIORITY } from "@/config/business-rules";
import type { ProductAccessRule } from "@/config/product-access";
import { canAccessClass } from "./product-access";
import type { ClassType, ProductType } from "@/types/domain";

export interface ActiveSubscription {
  id: string;
  productId?: string;
  productType: ProductType;
  remainingCredits: number | null;
  danceStyleId: string | null;
  allowedLevels: string[] | null;
  /** For "selected_style" products — the student's chosen style. */
  selectedStyleId?: string | null;
  /** For "course_group" products — the student's chosen styles. */
  selectedStyleIds?: string[] | null;
}

export interface ClassContext {
  classType?: ClassType;
  danceStyleId: string | null;
  level: string | null;
}

// ── Legacy matchers (used when no access rule is available) ──

function matchesStyle(sub: ActiveSubscription, ctx: ClassContext): boolean {
  if (!sub.danceStyleId) return true;
  return sub.danceStyleId === ctx.danceStyleId;
}

function matchesLevel(sub: ActiveSubscription, ctx: ClassContext): boolean {
  if (!sub.allowedLevels || sub.allowedLevels.length === 0) return true;
  if (!ctx.level) return true;
  return sub.allowedLevels.includes(ctx.level);
}

function hasCredits(sub: ActiveSubscription): boolean {
  if (sub.remainingCredits === null) return true;
  return sub.remainingCredits > 0;
}

// ── Access-rule-based matcher ───────────────────────────────

function matchesAccessRule(
  sub: ActiveSubscription,
  ctx: ClassContext,
  rule: ProductAccessRule
): boolean {
  const result = canAccessClass(
    rule,
    sub.selectedStyleId,
    sub.selectedStyleIds,
    {
      classType: ctx.classType ?? "class",
      danceStyleId: ctx.danceStyleId,
      level: ctx.level,
    }
  );
  return result.granted;
}

// ── Resolution ──────────────────────────────────────────────

/**
 * Find the best subscription to deduct a credit from for a given class.
 *
 * @param subscriptions  The student's active subscriptions
 * @param classCtx       The target class context (style, level, optionally classType)
 * @param accessRules    Optional map of productId → ProductAccessRule.
 *                       When provided and a subscription has a productId,
 *                       the access rule is used instead of legacy matching.
 * @param priority       Optional override for the deduction priority order.
 *                       Defaults to the static `CREDIT_DEDUCTION_PRIORITY`.
 *                       Server callers should pass the runtime
 *                       `creditDeductionPriority` setting; tests and pure
 *                       call sites can omit it to use the static default.
 */
export function resolveSubscription(
  subscriptions: ActiveSubscription[],
  classCtx: ClassContext,
  accessRules?: Map<string, ProductAccessRule>,
  priority: ProductType[] = CREDIT_DEDUCTION_PRIORITY,
): ActiveSubscription | null {
  for (const type of priority) {
    const match = subscriptions.find((s) => {
      if (s.productType !== type) return false;
      if (!hasCredits(s)) return false;

      if (accessRules && s.productId) {
        const rule = accessRules.get(s.productId);
        if (rule) return matchesAccessRule(s, classCtx, rule);
      }

      return matchesStyle(s, classCtx) && matchesLevel(s, classCtx);
    });
    if (match) return match;
  }
  return null;
}
