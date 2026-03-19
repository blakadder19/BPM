/**
 * Pure domain logic for term-related calculations.
 *
 * Terms are 4-week periods that define the commercial cycle.
 * All date strings are ISO "YYYY-MM-DD" format.
 */

import type { TermStatus } from "@/types/domain";

export interface TermLike {
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
      (t) => t.startDate <= today && today <= t.endDate && t.status === "active"
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
 * Beginner students can only start in weeks 1–2 of a term.
 */
export function isBeginnerEntryWeek(
  date: string,
  term: { startDate: string }
): boolean {
  const week = getTermWeekNumber(date, term);
  return week <= 2;
}

/**
 * A class is a beginner-entry class if its level starts with "Beginner 1".
 */
export function isBeginnerEntryClass(level: string | null): boolean {
  if (!level) return false;
  return level.startsWith("Beginner 1");
}
