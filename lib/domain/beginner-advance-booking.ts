/**
 * Beginner intake advance-booking rule (Phase 1).
 *
 * Business rule: Beginners 1 (and any other configured beginner level)
 * can be booked in advance for the *next* term as soon as that term's
 * schedule is published, but only for classes that fall within weeks
 * 1–2 of that term. Weeks 3–4 remain blocked so students don't join a
 * beginner course mid-way through. Current-term behaviour is unchanged
 * (the surrounding bookability engine still blocks beginner classes
 * once the current term has started).
 *
 * Pure function: all data passed as arguments, no store / settings
 * access. Callers (server actions, page renderers) pull
 * `beginnerLevelNames`, `allowAdvanceBooking`, etc. from settings and
 * thread them in.
 */

import {
  DEFAULT_BEGINNER_LEVEL_NAMES,
  isBeginnerLevelName,
} from "@/config/class-levels";
import { getTermWeekNumber, type TermLike } from "./term-rules";

/**
 * Default maximum 1-based term week into which a new beginner student
 * can self-book. Weeks 1–2 = allowed, 3+ = blocked. Mirrors the
 * existing `adminLateEntryMaxClassNumber` default (2) and the academy's
 * stated rule that Beginners 1 can only be joined during the first two
 * weeks of the term.
 */
export const DEFAULT_BEGINNER_INTAKE_MAX_WEEK = 2;

/** Centralised student-facing copy so server actions and UI agree. */
export const BEGINNER_ADVANCE_MESSAGES = {
  weekTooLate:
    "Beginner 1 can only be joined during the first two weeks of the term.",
  termNotPublished: "Booking is not available yet for this term.",
} as const;

export type BeginnerAdvanceBlockReason =
  | "term_weeks_3_4"
  | "term_not_published";

export type CanBookBeginnerIntakeResult =
  | { allowed: true }
  | { allowed: false; reason: BeginnerAdvanceBlockReason; message: string };

interface ClassInstanceLike {
  level: string | null;
  date: string;
  termBound?: boolean;
}

export interface CanBookBeginnerIntakeInput {
  classInstance: ClassInstanceLike;
  /**
   * The term row the class belongs to (with its stored `status` from
   * the DB — NOT the derived-from-dates status). When null the class
   * is not term-bound and the rule is inapplicable.
   */
  term: TermLike | null;
  /** Names treated as beginner intake levels. */
  beginnerLevelNames?: readonly string[];
  /**
   * Whether the academy currently allows advance-booking next-term
   * beginner classes at all. When `false` the helper blocks the same
   * way it would for a draft term.
   */
  allowAdvanceBooking?: boolean;
  /**
   * Inclusive max term week (1-based) in which a beginner student
   * can self-book. Defaults to {@link DEFAULT_BEGINNER_INTAKE_MAX_WEEK}.
   */
  maxIntakeWeek?: number;
  /** ISO YYYY-MM-DD reference date (for current-vs-next term split). */
  today: string;
}

/**
 * Decide whether a student can book a specific beginner intake class.
 *
 * Returns `{ allowed: true }` either when:
 *   - the class is not a beginner intake level, OR
 *   - the class is not term-bound (no term gating applies), OR
 *   - the class lives in the *current* term (other engine rules
 *     control current-term behaviour; this helper deliberately
 *     does not regress that path), OR
 *   - the class lives in a *next* (future) term that is published
 *     (`term.status` ∈ {"upcoming","active"}) AND falls within the
 *     first `maxIntakeWeek` weeks of that term.
 *
 * Returns a blocked result with a stable reason + ready-to-render
 * message in every other case.
 */
export function canBookBeginnerIntakeClass(
  input: CanBookBeginnerIntakeInput,
): CanBookBeginnerIntakeResult {
  const {
    classInstance,
    term,
    today,
    beginnerLevelNames = DEFAULT_BEGINNER_LEVEL_NAMES,
    allowAdvanceBooking = true,
    maxIntakeWeek = DEFAULT_BEGINNER_INTAKE_MAX_WEEK,
  } = input;

  if (!isBeginnerLevelName(classInstance.level, beginnerLevelNames)) {
    return { allowed: true };
  }

  if (!classInstance.termBound || !term) {
    return { allowed: true };
  }

  const isFutureTerm = today < term.startDate;
  if (!isFutureTerm) {
    // Current/past term — defer to existing rules.
    return { allowed: true };
  }

  // From here on we are looking at a future-term beginner class.
  const isPublished = term.status === "upcoming" || term.status === "active";

  if (!allowAdvanceBooking || !isPublished) {
    return {
      allowed: false,
      reason: "term_not_published",
      message: BEGINNER_ADVANCE_MESSAGES.termNotPublished,
    };
  }

  const week = getTermWeekNumber(classInstance.date, term);
  if (week > maxIntakeWeek) {
    return {
      allowed: false,
      reason: "term_weeks_3_4",
      message: BEGINNER_ADVANCE_MESSAGES.weekTooLate,
    };
  }

  return { allowed: true };
}
