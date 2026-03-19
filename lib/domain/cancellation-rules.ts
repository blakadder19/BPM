/**
 * Domain logic for cancellation timing and penalty applicability.
 * Uses shared datetime utilities from datetime.ts.
 */

import { getSettings } from "@/lib/services/settings-store";
import { classStartDT, getNow, minutesUntilStart } from "@/lib/domain/datetime";
import type { ClassType, PenaltyReason } from "@/types/domain";

/**
 * @deprecated — use classStartDT from datetime.ts directly
 */
export function classStartDateTime(date: string, startTime: string): Date {
  return classStartDT(date, startTime);
}

/**
 * A cancellation is "late" when it occurs within the cutoff window
 * before the class starts AND the class has NOT already started.
 * Once the class has started, cancellation is blocked at the action layer.
 */
export function isLateCancellation(
  classStart: Date,
  cancelledAt: Date,
  cutoffMinutes?: number
): boolean {
  const cutoff = cutoffMinutes ?? getSettings().lateCancelCutoffMinutes;
  const msUntilClass = classStart.getTime() - cancelledAt.getTime();
  if (msUntilClass < 0) return true; // past class — should not reach here
  return msUntilClass < cutoff * 60 * 1000;
}

export function penaltiesApplyTo(classType: ClassType): boolean {
  const s = getSettings();
  if (classType === "social") return !s.socialsExcludedFromPenalties;
  if (classType === "student_practice") return !s.penaltiesApplyToClassOnly;
  return true;
}

export function penaltyFeeCents(reason: PenaltyReason): number {
  const s = getSettings();
  return reason === "late_cancel" ? s.lateCancelFeeCents : s.noShowFeeCents;
}

/**
 * Full cancellation context for a class.
 * Returns whether the class has started, whether cancel is late, etc.
 */
export function getCancellationContext(
  classDate: string,
  classStartTime: string,
  cutoffMinutesOverride?: number
): {
  isLate: boolean;
  hasStarted: boolean;
  classStart: Date;
  minutesUntilStart: number;
  cutoffMinutes: number;
} {
  const s = getSettings();
  const cutoffMinutes = cutoffMinutesOverride ?? s.lateCancelCutoffMinutes;
  const mins = minutesUntilStart(classDate, classStartTime);
  const classStart = classStartDT(classDate, classStartTime);
  const hasStarted = mins <= 0;
  return {
    isLate: !hasStarted && mins < cutoffMinutes,
    hasStarted,
    classStart,
    minutesUntilStart: mins,
    cutoffMinutes,
  };
}
