/**
 * Pure domain logic for cancellation timing and penalty applicability.
 * No DB or framework imports — all inputs are plain typed arguments.
 */

import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import { LATE_CANCEL_CUTOFF_MINUTES } from "@/config/business-rules";
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
 */
export function isLateCancellation(
  classStart: Date,
  cancelledAt: Date,
  cutoffMinutes?: number
): boolean {
  const cutoff = cutoffMinutes ?? LATE_CANCEL_CUTOFF_MINUTES;
  const msUntilClass = classStart.getTime() - cancelledAt.getTime();
  return msUntilClass < cutoff * 60 * 1000;
}

/**
 * Whether penalties (late-cancel / no-show) apply to this class type.
 * Socials and student practice are excluded.
 */
export function penaltiesApplyTo(classType: ClassType): boolean {
  return CLASS_TYPE_CONFIG[classType].penaltiesApply;
}

/**
 * Get the fee in euro-cents for a given penalty reason.
 */
export function penaltyFeeCents(reason: PenaltyReason): number {
  const s = getSettings();
  return reason === "late_cancel" ? s.lateCancelFeeCents : s.noShowFeeCents;
}
