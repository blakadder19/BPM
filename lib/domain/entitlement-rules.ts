/**
 * Pure domain helpers for matching student entitlements to class instances.
 * No side effects, no store access — all data passed as arguments.
 */

import type { ClassType, ProductType } from "@/types/domain";
import type { ProductAccessRule, StyleAccess } from "@/config/product-access";
import type { MockSubscription } from "@/lib/mock-data";
import type { TermLike } from "./term-rules";
import { resolveAccessRuleForSubscription } from "./subscription-snapshot";
import { getTodayStr } from "./datetime";
import {
  isSubscriptionUsable,
  usableRemainingCredits,
  getCreditSnapshot,
} from "./credit-availability";

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
  validUntil: string | null;
  isBirthdayBenefit?: boolean;
  isRecommended?: boolean;
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
      if (cls.styleId && access.styleIds.includes(cls.styleId)) return true;
      if (cls.styleName && access.styleNames && access.styleNames.includes(cls.styleName)) return true;
      return false;
    case "selected_style": {
      if (!cls.styleName && !cls.styleId) return false;
      // Try ID-based match first, then fall through to name-based
      if (cls.styleId && sub.selectedStyleId && cls.styleId === sub.selectedStyleId) return true;
      if (cls.styleId && sub.selectedStyleIds && sub.selectedStyleIds.includes(cls.styleId)) return true;
      if (cls.styleName && sub.selectedStyleName && sub.selectedStyleName === cls.styleName) return true;
      if (cls.styleName && sub.selectedStyleNames && sub.selectedStyleNames.includes(cls.styleName)) return true;
      return false;
    }
    case "course_group": {
      if (!cls.styleName && !cls.styleId) return false;
      if (cls.styleId && sub.selectedStyleIds && sub.selectedStyleIds.includes(cls.styleId)) return true;
      if (cls.styleName && sub.selectedStyleNames && sub.selectedStyleNames.includes(cls.styleName)) return true;
      return false;
    }
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
  accessRule: ProductAccessRule | undefined,
  /**
   * Phase 16 — "now" for the expiry check. Defaults to the real
   * today; tests and deterministic replays pass it explicitly.
   */
  today: string = getTodayStr(),
): boolean {
  if (sub.status !== "active") return false;

  // Phase 16 — the entitlement must be usable RIGHT NOW, not merely
  // cover the class date. Without this, a pass whose term ended
  // yesterday could still be spent on a class that fell inside its
  // old window, and — more importantly — a row that lifecycle has
  // not yet flipped to `expired` would still read as bookable.
  // Booking enforcement must not depend on a nightly job having run.
  if (!isSubscriptionUsable(sub, today)) return false;

  if (cls.date < sub.validFrom) return false;
  if (sub.validUntil && cls.date > sub.validUntil) return false;
  if (!hasRemainingUsage(sub)) return false;
  if (!accessRule) return false;
  if (!classTypeMatches(accessRule.allowedClassTypes, cls.classType)) return false;
  if (!styleMatches(accessRule.styleAccess, cls, sub)) return false;
  if (!levelMatches(accessRule.allowedLevels, cls.level)) return false;

  return true;
}

export function getValidEntitlements(
  subscriptions: MockSubscription[],
  cls: ClassContext,
  terms: TermLike[],
  accessRulesMap: Map<string, ProductAccessRule>,
  today: string = getTodayStr(),
): ValidEntitlement[] {
  return subscriptions
    .filter((sub) =>
      isEntitlementValidForClass(
        sub,
        cls,
        terms,
        // Phase 1: prefer the frozen-at-purchase snapshot when present;
        // fall back to the live access rule for legacy subscriptions.
        resolveAccessRuleForSubscription(sub, accessRulesMap),
        today,
      )
    )
    .map((sub) => toValidEntitlement(sub, today));
}

/**
 * When getValidEntitlements returns empty, diagnose why.
 * Returns a student-facing reason explaining the block.
 */
export function diagnoseNoEntitlement(
  subscriptions: MockSubscription[],
  cls: ClassContext,
  accessRulesMap: Map<string, ProductAccessRule>,
  today: string = getTodayStr(),
): string {
  if (subscriptions.length === 0) {
    return "You need a membership, pass, or drop-in to book classes.";
  }

  // Phase 16 — when the block is specifically "your pass ended and you
  // still had credits on it", say so plainly. Otherwise a student
  // whose dashboard showed leftover credits yesterday gets a vague
  // message today and assumes it is a bug.
  const lapsedWithCredits = subscriptions
    .map((s) => ({ sub: s, snap: getCreditSnapshot(s, today) }))
    .find(({ snap }) => snap.isPastValidity && (snap.historicalRemaining ?? 0) > 0);
  if (lapsedWithCredits) {
    const { sub, snap } = lapsedWithCredits;
    const noun = snap.model === "class_count" ? "classes" : "credits";
    return `${sub.productName} ended on ${snap.expiredOn}. The ${snap.historicalRemaining} unused ${noun} expired with it and cannot be used for this class. Buy a new pass or drop-in to book.`;
  }

  // Separate subscriptions into "currently in date window" vs "not yet active / expired"
  // so that messages about current products are prioritised over future ones.
  let anyExhausted = false;
  let anyStyleMismatch = false;
  let anyLevelMismatch = false;
  let anyTypeMismatch = false;
  let anyExpired = false;
  let anyClassInFutureTerm = false;
  let anyNotYetValid = false;
  let notYetValidName: string | null = null;
  let exhaustedName: string | null = null;

  for (const sub of subscriptions) {
    // Phase 1: prefer snapshot, fall back to live rule for legacy subs.
    const rule = resolveAccessRuleForSubscription(sub, accessRulesMap);

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
    // Access rules passed — now check date window and usage
    if (cls.date < sub.validFrom) {
      anyNotYetValid = true;
      notYetValidName = sub.productName;
      continue;
    }
    if (sub.validUntil && cls.date > sub.validUntil) {
      if (sub.termId) {
        anyClassInFutureTerm = true;
      } else {
        anyExpired = true;
      }
      continue;
    }
    if (!hasRemainingUsage(sub)) {
      anyExhausted = true;
      exhaustedName = sub.productName;
      continue;
    }
  }

  // Priority: issues from currently-active-window products first, then future/expired.
  // This prevents a future subscription's "not yet valid" from masking a current product's
  // real issue (e.g. exhausted credits or style mismatch).
  if (anyExhausted && exhaustedName) {
    return `${exhaustedName}: all classes used. You can buy a drop-in or upgrade your plan.`;
  }
  if (anyStyleMismatch) {
    const styleLabel = cls.styleName ?? "this style";
    return `Your current plan doesn't cover ${styleLabel}. You need a plan or drop-in that includes this style.`;
  }
  if (anyLevelMismatch) {
    const levelLabel = cls.level ?? "this level";
    return `Your current plan doesn't include ${levelLabel} classes. Check available plans for this level.`;
  }
  if (anyTypeMismatch) {
    return "Your current plan doesn't include this type of class. Check available products.";
  }
  if (anyExpired) {
    return "Your membership or pass has expired. Renew or get a new plan to continue booking.";
  }
  if (anyNotYetValid && notYetValidName) {
    return `${notYetValidName} starts in a later term and can't be used for this class yet.`;
  }
  if (anyClassInFutureTerm) {
    return "This class is in a future term. You need a plan for that term to book it.";
  }
  return "No matching plan for this class. Browse available products to get started.";
}

export function toValidEntitlement(
  sub: MockSubscription,
  today: string = getTodayStr(),
): ValidEntitlement {
  // A ValidEntitlement only ever describes something the student CAN
  // book, so the credit figures here are the USABLE ones. Historical
  // leftovers belong on the history surfaces, not on a booking picker.
  const usable = usableRemainingCredits(sub, today);
  return {
    subscriptionId: sub.id,
    productName: sub.productName,
    productType: sub.productType,
    description: describeEntitlement(sub, today),
    classesUsed: sub.classesUsed,
    classesPerTerm: sub.classesPerTerm,
    remainingCredits: sub.remainingCredits === null ? null : usable,
    totalCredits: sub.totalCredits,
    validUntil: sub.validUntil ?? null,
    isBirthdayBenefit: false,
  };
}

export function describeEntitlement(
  sub: MockSubscription,
  today: string = getTodayStr(),
): string {
  const usable = usableRemainingCredits(sub, today) ?? 0;
  if (sub.productType === "membership" && sub.classesPerTerm !== null) {
    return `${sub.productName} — ${usable} of ${sub.classesPerTerm} classes left`;
  }
  if (sub.productType === "drop_in") {
    return `${sub.productName} — ${usable} use`;
  }
  if (sub.remainingCredits !== null) {
    return `${sub.productName} — ${usable} credits left`;
  }
  return sub.productName;
}
