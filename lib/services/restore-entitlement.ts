import "server-only";

import { getSubscriptionRepo } from "@/lib/repositories";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";

/**
 * Validates that the entitlement used by a cancelled booking is still
 * available for restore. Rejects if:
 * - birthday benefit was re-consumed by another booking
 * - birthday class date is outside the student's birthday week
 * - subscription no longer has capacity (classes or credits)
 * - subscription is no longer active
 */
export async function validateRestoreEntitlement(booking: {
  source?: string | null;
  subscriptionId?: string | null;
  studentId: string;
}, opts?: {
  classDate?: string;
  studentDateOfBirth?: string | null;
}): Promise<{ valid: boolean; reason?: string }> {
  if (booking.source === "birthday") {
    const { isBirthdayWeek } = await import("@/lib/domain/member-benefits");
    if (opts?.classDate && opts.studentDateOfBirth) {
      if (!isBirthdayWeek(opts.studentDateOfBirth, opts.classDate)) {
        return {
          valid: false,
          reason: "This class date is outside your birthday week. The birthday benefit cannot be restored.",
        };
      }
    }
    const year = new Date().getFullYear();
    const alreadyUsed = await isBirthdayClassUsed(booking.studentId, year);
    if (alreadyUsed) {
      return {
        valid: false,
        reason: "Your birthday free class has already been used for another booking this year.",
      };
    }
    return { valid: true };
  }

  if (booking.subscriptionId) {
    const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
    if (!sub) {
      return { valid: false, reason: "The entitlement used for this booking no longer exists." };
    }
    if (sub.status !== "active") {
      return {
        valid: false,
        reason: `Cannot restore — your ${sub.productName} is ${sub.status}.`,
      };
    }
    if (opts?.classDate && opts.classDate < sub.validFrom) {
      return {
        valid: false,
        reason: `Cannot restore — your ${sub.productName} doesn't start until ${sub.validFrom}.`,
      };
    }
    if (opts?.classDate && sub.validUntil && opts.classDate > sub.validUntil) {
      return {
        valid: false,
        reason: `Cannot restore — your ${sub.productName} expired on ${sub.validUntil}.`,
      };
    }
    if (sub.productType === "membership" && sub.classesPerTerm !== null) {
      if (sub.classesUsed >= sub.classesPerTerm) {
        return {
          valid: false,
          reason: `Cannot restore — all ${sub.classesPerTerm} classes on ${sub.productName} have been used.`,
        };
      }
    } else if (sub.remainingCredits !== null && sub.remainingCredits <= 0) {
      return {
        valid: false,
        reason: `Cannot restore — no credits remaining on ${sub.productName}.`,
      };
    }
  }

  return { valid: true };
}
