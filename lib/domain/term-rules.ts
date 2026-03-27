/**
 * Pure domain logic for term-related calculations.
 *
 * Terms are 4-week periods that define the commercial cycle.
 * All date strings are ISO "YYYY-MM-DD" format.
 */

import type { TermStatus } from "@/types/domain";

export interface TermLike {
  id?: string;
  name?: string;
  startDate: string;
  endDate: string;
  status: TermStatus;
}

export function deriveTermStatus(
  term: { startDate: string; endDate: string },
  today: string
): TermStatus {
  if (today < term.startDate) return "upcoming";
  if (today > term.endDate) return "past";
  return "active";
}

export function getCurrentTerm<T extends TermLike>(
  terms: T[],
  today: string
): T | null {
  return (
    terms.find(
      (t) => t.startDate <= today && today <= t.endDate && deriveTermStatus(t, today) === "active"
    ) ?? null
  );
}

export function getNextTerm<T extends TermLike>(
  terms: T[],
  today: string
): T | null {
  return (
    terms
      .filter(
        (t) =>
          t.startDate > today &&
          (t.status === "upcoming" || t.status === "draft")
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null
  );
}

export function findTermForDate<T extends TermLike>(
  terms: T[],
  date: string
): T | null {
  return terms.find((t) => t.startDate <= date && date <= t.endDate) ?? null;
}

export function isDateInTerm(
  date: string,
  term: { startDate: string; endDate: string }
): boolean {
  return date >= term.startDate && date <= term.endDate;
}

/**
 * Returns 1-based week number within the term (1–4).
 * Week 1 starts on term.startDate; each week is 7 days.
 */
export function getTermWeekNumber(
  date: string,
  term: { startDate: string }
): number {
  const start = new Date(term.startDate);
  const target = new Date(date);
  const diffMs = target.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(week, 4));
}

/**
 * Returns true when a class level suggests term enforcement by default.
 * Beginner 1 and Beginner 2 courses default to enforced, but any class
 * can be term-linked/enforced via admin controls.  Used as a UI default
 * suggestion — NOT as an enforcement gate.
 */
export function isTermBoundLevel(level: string | null): boolean {
  if (!level) return false;
  const l = level.trim();
  return l.startsWith("Beginner 1") || l.startsWith("Beginner 2");
}

/**
 * Whether this level is a beginner course (Beginner 1 or Beginner 2).
 * Returns a positive number for beginner levels, 0 otherwise.
 * Both Beginner 1 and Beginner 2 share the same late-entry policy
 * controlled by the `adminLateEntryMaxClassNumber` setting.
 */
export function beginnerMaxEntryWeek(level: string | null): number {
  if (!level) return 0;
  if (level.startsWith("Beginner 1") || level.startsWith("Beginner 2")) return 1;
  return 0;
}

/**
 * Whether the class date falls within the allowed entry window
 * for new students in a beginner-level term-bound course.
 */
export function isBeginnerEntryWeek(
  level: string | null,
  date: string,
  term: { startDate: string }
): boolean {
  const maxWeek = beginnerMaxEntryWeek(level);
  if (maxWeek === 0) return true;
  const week = getTermWeekNumber(date, term);
  return week <= maxWeek;
}

/**
 * Whether a level is a beginner-entry class (Beginner 1 or Beginner 2).
 */
export function isBeginnerEntryClass(level: string | null): boolean {
  return beginnerMaxEntryWeek(level) > 0;
}

/**
 * Given a list of terms sorted by startDate and a reference term,
 * returns the term whose startDate immediately follows the reference
 * term's endDate (i.e. starts the day after or within a short gap).
 *
 * "Consecutive" is defined as: the next term in chronological order
 * after the reference term, regardless of gap size. This matches the
 * BPM term structure where terms follow sequentially.
 */
export function getNextConsecutiveTerm<T extends TermLike>(
  terms: T[],
  referenceTermId: string
): T | null {
  const sorted = [...terms].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  const idx = sorted.findIndex((t) => t.id === referenceTermId);
  if (idx === -1 || idx === sorted.length - 1) return null;
  return sorted[idx + 1];
}
