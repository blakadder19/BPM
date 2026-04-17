/**
 * Server-side computation of admin operational alerts.
 * Each alert is grounded in real data from the in-memory stores.
 * Pure logic — no DB calls, no side effects.
 */

import type { MockBookableClass, MockTerm, MockTeacherPair } from "@/lib/mock-data";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AdminAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** Suggested navigation path, if applicable */
  href?: string;
  /** Optional rich broadcast metadata for the detail view */
  broadcast?: {
    imageUrl?: string | null;
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    category?: string | null;
    sentAt?: string | null;
  };
}

export interface AlertTypeMeta {
  id: string;
  label: string;
  description: string;
}

export const ALERT_TYPE_META: AlertTypeMeta[] = [
  { id: "no-active-term", label: "No active term", description: "Warns when no term is currently running." },
  { id: "term-ending-soon", label: "Term ending soon", description: "Warns when the current term ends within 7 days." },
  { id: "term-starting-soon", label: "Term starting soon", description: "Informs when the next term starts within 7 days." },
  { id: "no-upcoming-terms", label: "No upcoming terms", description: "Informs when no future terms are defined after the current one." },
  { id: "classes-without-teacher", label: "Classes without teacher", description: "Warns about upcoming classes with no teacher assigned (14-day lookahead)." },
  { id: "schedule-gap", label: "Schedule gap", description: "Warns when the next term has no class instances generated." },
];

interface AlertInput {
  terms: MockTerm[];
  instances: MockBookableClass[];
  teacherAssignments: MockTeacherPair[];
  today: string;
  disabledAlertIds?: string[];
}

const TERM_ENDING_SOON_DAYS = 7;
const TERM_STARTING_SOON_DAYS = 7;
const TEACHER_LOOKAHEAD_DAYS = 14;

function daysUntil(today: string, target: string): number {
  const t = new Date(today + "T12:00:00");
  const d = new Date(target + "T12:00:00");
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function computeAdminAlerts(input: AlertInput): AdminAlert[] {
  const { terms, instances, teacherAssignments, today, disabledAlertIds } = input;
  const alerts: AdminAlert[] = [];

  const sortedTerms = [...terms].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );
  const activeTerm = sortedTerms.find(
    (t) => t.startDate <= today && today <= t.endDate
  );
  const futureTerms = sortedTerms.filter((t) => t.startDate > today);
  const nextTerm = futureTerms[0] ?? null;

  // 1. No active term
  if (!activeTerm) {
    if (nextTerm) {
      const days = daysUntil(today, nextTerm.startDate);
      alerts.push({
        id: "no-active-term",
        severity: "warning",
        title: "No active term",
        message: `No term is currently running. Next term "${nextTerm.name}" starts in ${days} day${days !== 1 ? "s" : ""}.`,
        href: "/terms",
      });
    } else {
      alerts.push({
        id: "no-active-term",
        severity: "critical",
        title: "No active term",
        message:
          "No term is currently active and no future terms are defined. Create terms to organise the schedule.",
        href: "/terms",
      });
    }
  }

  // 2. Term ending soon
  if (activeTerm) {
    const daysLeft = daysUntil(today, activeTerm.endDate);
    if (daysLeft >= 0 && daysLeft <= TERM_ENDING_SOON_DAYS) {
      alerts.push({
        id: "term-ending-soon",
        severity: "warning",
        title: "Current term ending soon",
        message: `"${activeTerm.name}" ends ${daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}. ${nextTerm ? `Next: "${nextTerm.name}" starts ${nextTerm.startDate}.` : "No next term defined — consider creating one."}`,
        href: "/terms",
      });
    }
  }

  // 3. Term starting soon (only if not already active)
  if (!activeTerm && nextTerm) {
    const daysTo = daysUntil(today, nextTerm.startDate);
    if (daysTo > 0 && daysTo <= TERM_STARTING_SOON_DAYS) {
      alerts.push({
        id: "term-starting-soon",
        severity: "info",
        title: "Next term starting soon",
        message: `"${nextTerm.name}" starts in ${daysTo} day${daysTo !== 1 ? "s" : ""}. Verify the schedule is generated and teachers are assigned.`,
        href: "/terms",
      });
    }
  }

  // 4. No upcoming terms (if active term exists but nothing after it)
  if (activeTerm && futureTerms.length === 0) {
    alerts.push({
      id: "no-upcoming-terms",
      severity: "info",
      title: "No upcoming terms defined",
      message: `"${activeTerm.name}" is the last defined term. Create future terms so classes can continue.`,
      href: "/terms",
    });
  }

  // 5. Upcoming classes without teacher
  const lookaheadEnd = addDays(today, TEACHER_LOOKAHEAD_DAYS);
  const upcomingInstances = instances.filter(
    (bc) =>
      bc.date >= today &&
      bc.date <= lookaheadEnd &&
      bc.status !== "cancelled" &&
      bc.classType === "class"
  );

  const activeAssignmentByClass = new Map<string, boolean>();
  for (const a of teacherAssignments) {
    if (a.isActive) activeAssignmentByClass.set(a.classId, true);
  }

  const unassigned = upcomingInstances.filter((bc) => {
    if (bc.teacherOverride1Id) return false;
    if (bc.classId && activeAssignmentByClass.has(bc.classId)) return false;
    return true;
  });

  if (unassigned.length > 0) {
    const uniqueDates = new Set(unassigned.map((bc) => bc.date));
    alerts.push({
      id: "classes-without-teacher",
      severity: "warning",
      title: `${unassigned.length} class${unassigned.length !== 1 ? "es" : ""} without teacher`,
      message: `${unassigned.length} upcoming class instance${unassigned.length !== 1 ? "s" : ""} across ${uniqueDates.size} day${uniqueDates.size !== 1 ? "s" : ""} in the next ${TEACHER_LOOKAHEAD_DAYS} days have no teacher assigned.`,
      href: "/classes/teachers",
    });
  }

  // 6. Schedule gap — next term has no instances generated
  if (nextTerm) {
    const termInstances = instances.filter(
      (bc) =>
        bc.date >= nextTerm.startDate &&
        bc.date <= nextTerm.endDate &&
        bc.status !== "cancelled"
    );
    if (termInstances.length === 0) {
      alerts.push({
        id: "schedule-gap",
        severity: "warning",
        title: "Schedule not generated for next term",
        message: `"${nextTerm.name}" (${nextTerm.startDate} – ${nextTerm.endDate}) has no class instances yet. Generate or copy the schedule before the term starts.`,
        href: "/classes/bookable",
      });
    }
  }

  if (disabledAlertIds && disabledAlertIds.length > 0) {
    const disabled = new Set(disabledAlertIds);
    return alerts.filter((a) => !disabled.has(a.id));
  }

  return alerts;
}
