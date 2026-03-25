/**
 * Pure domain logic for booking eligibility and role balancing.
 * No DB or framework imports — all inputs are plain typed arguments.
 */

import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import { ALLOWED_ROLE_IMBALANCE } from "@/config/business-rules";
import type { ClassType, DanceRole, InstanceStatus } from "@/types/domain";

export interface BookableClassCapacity {
  classType: ClassType;
  status: InstanceStatus;
  danceStyleRequiresBalance: boolean;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  currentLeaders: number;
  currentFollowers: number;
  totalBooked: number;
  /** Override the global ALLOWED_ROLE_IMBALANCE for this decision. */
  allowedImbalance?: number;
}

export type BookingDecision =
  | { allowed: true; waitlisted: false }
  | { allowed: true; waitlisted: true; reason: string }
  | { allowed: false; waitlisted: false; reason: string };

export function isBookableClassType(classType: ClassType): boolean {
  return CLASS_TYPE_CONFIG[classType].bookable;
}

/**
 * Determine whether a student can book into a class, be waitlisted, or is rejected.
 *
 * For partner classes (danceStyleRequiresBalance=true):
 *   1. Role must be provided
 *   2. Per-role hard cap is checked
 *   3. Imbalance between leader/follower counts is checked
 *   4. Total capacity is checked
 *
 * For non-partner classes:
 *   - Only total capacity is checked; role balance is skipped entirely.
 */
export function canBook(
  bc: BookableClassCapacity,
  role: DanceRole | null,
  opts?: { skipStatusCheck?: boolean }
): BookingDecision {
  if (!opts?.skipStatusCheck && bc.status !== "open") {
    return { allowed: false, waitlisted: false, reason: "Class is not open for booking" };
  }

  if (!isBookableClassType(bc.classType)) {
    return { allowed: false, waitlisted: false, reason: "This event type is not bookable" };
  }

  if (bc.danceStyleRequiresBalance && !role) {
    return { allowed: false, waitlisted: false, reason: "Role selection required for this class" };
  }

  if (bc.danceStyleRequiresBalance && role) {
    const cap = role === "leader" ? bc.leaderCap : bc.followerCap;
    const current = role === "leader" ? bc.currentLeaders : bc.currentFollowers;

    if (cap !== null && current >= cap) {
      return { allowed: true, waitlisted: true, reason: `${role} spots full — added to waitlist` };
    }

    const newLeaders = bc.currentLeaders + (role === "leader" ? 1 : 0);
    const newFollowers = bc.currentFollowers + (role === "follower" ? 1 : 0);
    const imbalance = Math.abs(newLeaders - newFollowers);
    const limit = bc.allowedImbalance ?? ALLOWED_ROLE_IMBALANCE;

    if (imbalance > limit) {
      return {
        allowed: true,
        waitlisted: true,
        reason: `Would exceed role balance limit — added to waitlist`,
      };
    }
  }

  if (bc.maxCapacity !== null && bc.totalBooked >= bc.maxCapacity) {
    return { allowed: true, waitlisted: true, reason: "Class is full — added to waitlist" };
  }

  return { allowed: true, waitlisted: false };
}

export function nextWaitlistPosition(
  currentMaxPosition: number | null
): number {
  return (currentMaxPosition ?? 0) + 1;
}
