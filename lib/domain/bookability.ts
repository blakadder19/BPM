/**
 * Bookability engine — determines a student's booking eligibility for a class.
 *
 * Pure function: all data passed as arguments, no store access.
 * Used by both server-side page rendering (for display) and server actions (for validation).
 */

import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import {
  DEFAULT_BEGINNER_LEVEL_NAMES,
  isBeginnerLevelName,
} from "@/config/class-levels";
import type { ClassType, DanceRole, InstanceStatus, ProductType } from "@/types/domain";
import type { ProductAccessRule } from "@/config/product-access";
import type { MockSubscription } from "@/lib/mock-data";
import type { TermLike } from "./term-rules";
import { findTermForDate, deriveTermStatus } from "./term-rules";
import {
  getValidEntitlements,
  diagnoseNoEntitlement,
  type ClassContext,
  type ValidEntitlement,
} from "./entitlement-rules";
import { canBook, type BookableClassCapacity } from "./booking-rules";
import { isClassStarted, getTodayStr } from "./datetime";
import { isBirthdayWeek } from "./member-benefits";

// ── Result types ────────────────────────────────────────────

export type BookabilityResult =
  | { status: "bookable"; entitlements: ValidEntitlement[]; autoSelected?: ValidEntitlement }
  | { status: "waitlistable"; reason: string; entitlements: ValidEntitlement[] }
  | { status: "needs_role"; entitlements: ValidEntitlement[]; autoSelected?: ValidEntitlement }
  | { status: "blocked"; reason: string; needsProduct?: boolean }
  | { status: "already_booked"; bookingId: string; bookingStatus: string }
  | { status: "already_waitlisted"; waitlistId: string; position: number }
  | { status: "restore_available"; bookingId: string; bookingStatus: string }
  | { status: "not_bookable"; reason: string };

// ── Input types ─────────────────────────────────────────────

export interface ClassInstanceInfo {
  id: string;
  title: string;
  classType: ClassType;
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: InstanceStatus;
  location: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  danceStyleRequiresBalance: boolean;
  currentLeaders: number;
  currentFollowers: number;
  totalBooked: number;
  termBound?: boolean;
  termId?: string | null;
}

export interface StudentBookingState {
  activeBookingId: string | null;
  activeBookingStatus: string | null;
  waitlistEntry: { id: string; position: number } | null;
  cancelledBooking: { id: string; status: string } | null;
}

export interface BirthdayBenefitState {
  eligible: boolean;
  alreadyUsed: boolean;
  membershipSubscriptionId: string | null;
}

export interface BookabilityContext {
  classInstance: ClassInstanceInfo;
  studentState: StudentBookingState;
  studentSubscriptions: MockSubscription[];
  terms: TermLike[];
  accessRulesMap: Map<string, ProductAccessRule>;
  studentPreferredRole: DanceRole | null;
  codeOfConductAccepted: boolean;
  birthdayBenefit?: BirthdayBenefitState;
  studentDateOfBirth?: string | null;
  /**
   * Phase 2B: level names treated as beginner courses for term-start gating.
   * Defaults to DEFAULT_BEGINNER_LEVEL_NAMES when omitted; server callers
   * should pass `getSettings().beginnerLevelNames`.
   */
  beginnerLevelNames?: readonly string[];
}

// ── Recommendation logic ────────────────────────────────────

const PASS_TYPES = new Set(["pass", "credit_pack", "promo_pass", "drop_in"]);

function markRecommended(entitlements: ValidEntitlement[]): void {
  // Prefer pass-like products (use-it-or-lose-it) over long-running memberships.
  // Among equals, prefer the one with the nearest expiry date.
  let best: ValidEntitlement | null = null;
  let bestScore = Infinity;

  for (const e of entitlements) {
    if (e.isBirthdayBenefit) continue;
    const isPass = PASS_TYPES.has(e.productType);
    const tierPenalty = isPass ? 0 : 1_000_000;
    const datePenalty = e.validUntil
      ? new Date(e.validUntil).getTime()
      : Number.MAX_SAFE_INTEGER;
    const score = tierPenalty + datePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }

  if (best) best.isRecommended = true;
}

// ── Engine ──────────────────────────────────────────────────

export function computeBookability(ctx: BookabilityContext): BookabilityResult {
  const { classInstance: cls, studentState } = ctx;

  // 1. Class status gate — only open and scheduled instances proceed
  if (cls.status === "cancelled") {
    return { status: "not_bookable", reason: "Class is cancelled" };
  }
  if (cls.status !== "open" && cls.status !== "scheduled") {
    return { status: "not_bookable", reason: "Class is closed" };
  }

  // 1b. Time gate — students cannot book once the class has started
  if (isClassStarted(cls.date, cls.startTime)) {
    return { status: "not_bookable", reason: "Class has already started" };
  }

  // 2. Class type bookability
  const typeConfig = CLASS_TYPE_CONFIG[cls.classType];
  if (!typeConfig.bookable) {
    if (cls.classType === "student_practice") {
      return { status: "not_bookable", reason: "Pay at reception" };
    }
    if (cls.classType === "social") {
      return { status: "not_bookable", reason: "Not online-bookable" };
    }
    return { status: "not_bookable", reason: "Not online-bookable" };
  }

  // 3. Already booked (confirmed / checked_in)
  if (studentState.activeBookingId) {
    return {
      status: "already_booked",
      bookingId: studentState.activeBookingId,
      bookingStatus: studentState.activeBookingStatus ?? "confirmed",
    };
  }

  // 4. Already waitlisted
  if (studentState.waitlistEntry) {
    return {
      status: "already_waitlisted",
      waitlistId: studentState.waitlistEntry.id,
      position: studentState.waitlistEntry.position,
    };
  }

  // 5. Restorable cancelled booking — must come before entitlement/capacity checks
  if (studentState.cancelledBooking) {
    return {
      status: "restore_available",
      bookingId: studentState.cancelledBooking.id,
      bookingStatus: studentState.cancelledBooking.status,
    };
  }

  // 6. Term restriction — only applies to term-bound classes.
  //    Uses explicit termId when available, falls back to date inference.
  //    If no term is found at all, the class is blocked (invalid data).
  let classTerm: TermLike | null = null;
  if (cls.termBound) {
    if (cls.termId) {
      classTerm = ctx.terms.find((t) => t.id === cls.termId) ?? null;
    }
    if (!classTerm) {
      classTerm = findTermForDate(ctx.terms, cls.date);
    }
    if (!classTerm) {
      return {
        status: "not_bookable",
        reason: "This class is not scheduled within any active term period.",
      };
    }

    const effectiveTermStatus = deriveTermStatus(classTerm, getTodayStr());

    if (effectiveTermStatus === "upcoming") {
      // Term hasn't started yet — student can book normally.
    } else if (effectiveTermStatus === "active") {
      // Birthday benefit can bypass term-start restriction for non-beginner classes.
      // Configured beginner levels always have term-start gating per academy rule.
      const beginnerLevels = ctx.beginnerLevelNames ?? DEFAULT_BEGINNER_LEVEL_NAMES;
      const isBeginnerLevel = isBeginnerLevelName(cls.level, beginnerLevels);
      const hasBirthdayOverride =
        ctx.birthdayBenefit?.eligible &&
        !ctx.birthdayBenefit.alreadyUsed &&
        ctx.studentDateOfBirth &&
        isBirthdayWeek(ctx.studentDateOfBirth, cls.date);

      if (!hasBirthdayOverride || isBeginnerLevel) {
        return {
          status: "blocked",
          reason: "This course has already started. Please speak to reception if you'd like to check whether late entry is still possible.",
        };
      }
    } else {
      // past / ended
      return {
        status: "blocked",
        reason: classTerm.name
          ? `The ${classTerm.name} term has ended. Check back for the next term.`
          : "This course term has ended. Check back for the next term.",
      };
    }
  }

  // 8. Entitlement filtering
  const classCtx: ClassContext = {
    classType: cls.classType,
    styleName: cls.styleName,
    styleId: cls.styleId,
    level: cls.level,
    date: cls.date,
  };
  const validEntitlements = getValidEntitlements(
    ctx.studentSubscriptions,
    classCtx,
    ctx.terms,
    ctx.accessRulesMap
  );

  // 8b. Birthday benefit — inject only when the class date falls within the birthday week
  if (
    ctx.birthdayBenefit?.eligible &&
    !ctx.birthdayBenefit.alreadyUsed &&
    ctx.birthdayBenefit.membershipSubscriptionId &&
    ctx.studentDateOfBirth &&
    isBirthdayWeek(ctx.studentDateOfBirth, cls.date)
  ) {
    const memberSub = ctx.studentSubscriptions.find(
      (s) => s.id === ctx.birthdayBenefit!.membershipSubscriptionId
    );
    if (memberSub) {
      validEntitlements.push({
        subscriptionId: memberSub.id,
        productName: "Birthday Free Class",
        productType: "membership",
        description: "Free class — birthday week benefit",
        classesUsed: 0,
        classesPerTerm: null,
        remainingCredits: null,
        totalCredits: null,
        validUntil: null,
        isBirthdayBenefit: true,
      });
    }
  }

  if (validEntitlements.length === 0) {
    const reason = diagnoseNoEntitlement(
      ctx.studentSubscriptions,
      classCtx,
      ctx.accessRulesMap
    );
    return { status: "blocked", reason, needsProduct: true };
  }

  // 8c. Multi-entitlement recommendation — nearest expiry, preferring passes over memberships
  if (validEntitlements.length > 1) {
    markRecommended(validEntitlements);
  }

  // 9. Capacity + role-balance
  if (cls.status !== "open") {
    return { status: "blocked", reason: "Class is not open for booking" };
  }

  const capacity: BookableClassCapacity = {
    classType: cls.classType,
    status: cls.status,
    danceStyleRequiresBalance: cls.danceStyleRequiresBalance,
    maxCapacity: cls.maxCapacity,
    leaderCap: cls.leaderCap,
    followerCap: cls.followerCap,
    currentLeaders: cls.currentLeaders,
    currentFollowers: cls.currentFollowers,
    totalBooked: cls.totalBooked,
  };

  // Defer capacity/role check for students who haven't set a preferred role yet.
  // They'll pick a role in the booking dialog, and the server action will validate capacity then.
  if (cls.danceStyleRequiresBalance && !ctx.studentPreferredRole) {
    const autoSelected = validEntitlements.length === 1
      ? validEntitlements[0]
      : validEntitlements.find((e) => e.isRecommended);
    return {
      status: "needs_role",
      entitlements: validEntitlements,
      autoSelected,
    };
  }

  const role = cls.danceStyleRequiresBalance ? ctx.studentPreferredRole : null;
  const decision = canBook(capacity, role);

  if (!decision.allowed) {
    return { status: "blocked", reason: decision.reason };
  }

  if (decision.waitlisted) {
    return {
      status: "waitlistable",
      reason: decision.reason,
      entitlements: validEntitlements,
    };
  }

  const autoSelected = validEntitlements.length === 1
    ? validEntitlements[0]
    : validEntitlements.find((e) => e.isRecommended);

  return {
    status: "bookable",
    entitlements: validEntitlements,
    autoSelected,
  };
}
