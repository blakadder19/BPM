/**
 * Pure domain logic for cancellation timing and penalty applicability.
 * Reads runtime settings from the settings store so admin changes
 * take effect without redeployment.
 */

import { getSettings } from "@/lib/services/settings-store";
import type { ClassType, PenaltyReason } from "@/types/domain";

/**
 * Build a Date from a date string (YYYY-MM-DD) and time string (HH:MM).
 */
export function classStartDateTime(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00`);
}

/**
 * A cancellation is "late" when it occurs within the cutoff window
 * before the class starts. Cancellations after the class has started
 * are also treated as late.
 *
 * Reads `lateCancelCutoffMinutes` from settings unless an explicit
 * override is passed.
 */
export function isLateCancellation(
  classStart: Date,
  cancelledAt: Date,
  cutoffMinutes?: number
): boolean {
  const cutoff = cutoffMinutes ?? getSettings().lateCancelCutoffMinutes;
  const msUntilClass = classStart.getTime() - cancelledAt.getTime();
  return msUntilClass < cutoff * 60 * 1000;
}

/**
 * Whether penalties (late-cancel / no-show) apply to this class type,
 * based on the current admin settings.
 */
export function penaltiesApplyTo(classType: ClassType): boolean {
  const s = getSettings();

  if (classType === "social") {
    return !s.socialsExcludedFromPenalties;
  }

  if (classType === "student_practice") {
    return !s.penaltiesApplyToClassOnly;
  }

  return true;
}

/**
 * Get the fee in euro-cents for a given penalty reason.
 */
export function penaltyFeeCents(reason: PenaltyReason): number {
  const s = getSettings();
  return reason === "late_cancel" ? s.lateCancelFeeCents : s.noShowFeeCents;
}

/**
 * UI-facing context for cancel dialogs (admin and student).
 * Computes whether a cancellation at the current moment would be late.
 */
export function getCancellationContext(
  classDate: string,
  classStartTime: string,
  cutoffMinutesOverride?: number
): {
  isLate: boolean;
  classStart: Date;
  minutesUntilStart: number;
  cutoffMinutes: number;
} {
  const s = getSettings();
  const cutoffMinutes = cutoffMinutesOverride ?? s.lateCancelCutoffMinutes;
  const classStart = classStartDateTime(classDate, classStartTime);
  const now = new Date();
  const msUntilStart = classStart.getTime() - now.getTime();
  const minutesUntilStart = Math.round(msUntilStart / 60_000);
  return {
    isLate: msUntilStart < cutoffMinutes * 60_000,
    classStart,
    minutesUntilStart,
    cutoffMinutes,
  };
}
