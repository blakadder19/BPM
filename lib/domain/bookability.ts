/**
 * Bookability engine — determines a student's booking eligibility for a class.
 *
 * Pure function: all data passed as arguments, no store access.
 * Used by both server-side page rendering (for display) and server actions (for validation).
 */

import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import type { ClassType, DanceRole, InstanceStatus, ProductType } from "@/types/domain";
import type { ProductAccessRule } from "@/config/product-access";
import type { MockSubscription } from "@/lib/mock-data";
import type { TermLike } from "./term-rules";
import { findTermForDate, isBeginnerEntryWeek } from "./term-rules";
import { isBeginnerEntryClass } from "./term-rules";
import {
  getValidEntitlements,
  type ClassContext,
  type ValidEntitlement,
} from "./entitlement-rules";
import { canBook, type BookableClassCapacity } from "./booking-rules";

// ── Result types ────────────────────────────────────────────

export type BookabilityResult =
  | { status: "bookable"; entitlements: ValidEntitlement[]; autoSelected?: ValidEntitlement }
  | { status: "waitlistable"; reason: string; entitlements: ValidEntitlement[] }
  | { status: "blocked"; reason: string }
  | { status: "already_booked"; bookingId: string }
  | { status: "already_waitlisted"; waitlistId: string; position: number }
  | { status: "restore_available"; bookingId: string; bookingStatus: string }
  | { status: "not_bookable"; reason: string };

// ── Input types ─────────────────────────────────────────────

export interface ClassInstanceInfo {
  id: string;
  title: string;
  classType: ClassType;
  styleName: string | null;
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
}

export interface StudentBookingState {
  activeBookingId: string | null;
  waitlistEntry: { id: string; position: number } | null;
  cancelledBooking: { id: string; status: string } | null;
}

export interface BookabilityContext {
  classInstance: ClassInstanceInfo;
  studentState: StudentBookingState;
  studentSubscriptions: MockSubscription[];
  terms: TermLike[];
  accessRulesMap: Map<string, ProductAccessRule>;
  studentPreferredRole: DanceRole | null;
}

// ── Engine ──────────────────────────────────────────────────

export function computeBookability(ctx: BookabilityContext): BookabilityResult {
  const { classInstance: cls, studentState } = ctx;

  // 1. Class status
  if (cls.status !== "open" && cls.status !== "scheduled") {
    return { status: "not_bookable", reason: "Class is closed" };
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
    return { status: "already_booked", bookingId: studentState.activeBookingId };
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

  // 6. Term validity
  const classTerm = findTermForDate(ctx.terms, cls.date);
  if (!classTerm || (classTerm.status !== "active" && classTerm.status !== "upcoming")) {
    return { status: "blocked", reason: "Not in an active term" };
  }

  // 7. Beginner restriction
  if (isBeginnerEntryClass(cls.level)) {
    if (!isBeginnerEntryWeek(cls.date, classTerm)) {
      return { status: "blocked", reason: "Beginner intake closed (weeks 3–4)" };
    }
  }

  // 8. Entitlement filtering
  const classCtx: ClassContext = {
    classType: cls.classType,
    styleName: cls.styleName,
    level: cls.level,
    date: cls.date,
  };
  const validEntitlements = getValidEntitlements(
    ctx.studentSubscriptions,
    classCtx,
    ctx.terms,
    ctx.accessRulesMap
  );
  if (validEntitlements.length === 0) {
    return { status: "blocked", reason: "No valid entitlement" };
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

  const autoSelected = validEntitlements.length === 1 ? validEntitlements[0] : undefined;

  return {
    status: "bookable",
    entitlements: validEntitlements,
    autoSelected,
  };
}
