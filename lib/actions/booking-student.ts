"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getStudentRepo, getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription } from "@/lib/services/subscription-service";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSettings } from "@/lib/services/settings-store";
import { isClassStarted, minutesUntilStart } from "@/lib/domain/datetime";
import {
  getCancellationContext,
  penaltiesApplyTo,
  penaltyFeeCents,
} from "@/lib/domain/cancellation-rules";
import { isRealUser } from "@/lib/utils/is-real-user";
import { saveBookingToDB, saveWaitlistToDB, savePenaltyToDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { isBirthdayClassUsed, markBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";

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

export async function studentCancelBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  isLate?: boolean;
  penaltyApplied?: boolean;
  penaltyDescription?: string;
  error?: string;
}> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const user = await getAuthUser();
  await ensureOperationalDataHydrated();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  if (booking.studentId !== user.id) {
    return { success: false, error: "Not your booking" };
  }

  const terminalStatuses = new Set(["cancelled", "late_cancelled", "missed"]);
  if (terminalStatuses.has(booking.status)) {
    return { success: false, error: "This booking has already been cancelled or resolved" };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);

  if (ctx.hasStarted) {
    return { success: false, error: "Cannot cancel after class has started" };
  }

  const isLate = ctx.isLate;

  const cancelResult = isLate
    ? svc.cancelBookingAsAdmin(bookingId, true)
    : svc.cancelBooking(bookingId);

  if (cancelResult.type === "error") {
    return { success: false, error: cancelResult.reason };
  }

  // Return credits — but NOT for birthday bookings (no credits were consumed)
  if (booking.subscriptionId && booking.source !== "birthday") {
    const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
    if (sub) {
      if (sub.productType === "membership" && sub.classesPerTerm !== null && sub.classesUsed > 0) {
        await updateSubscription(sub.id, { classesUsed: sub.classesUsed - 1 });
      } else if (sub.remainingCredits !== null) {
        await updateSubscription(sub.id, { remainingCredits: sub.remainingCredits + 1 });
      }
    }
  }

  // If this was a birthday booking being cancelled, unreserve the birthday benefit
  if (booking.source === "birthday") {
    const { unmarkBirthdayClassUsed } = await import("@/lib/services/birthday-benefit-store");
    await unmarkBirthdayClassUsed(booking.studentId, new Date().getFullYear());
  }

  let penaltyApplied = false;
  let penaltyDescription: string | undefined;

  if (isLate && penaltiesApplyTo(cls.classType)) {
    const settings = getSettings();
    if (settings.lateCancelPenaltiesEnabled) {
      const penaltySvc = getPenaltyService();
      const feeCents = penaltyFeeCents("late_cancel");
      const penalty = penaltySvc.addPenalty({
        studentId: booking.studentId,
        studentName: booking.studentName,
        bookingId: booking.id,
        bookableClassId: booking.bookableClassId,
        classTitle: cls.title,
        classDate: cls.date,
        reason: "late_cancel",
        amountCents: feeCents,
        resolution: "monetary_pending",
        subscriptionId: null,
        creditDeducted: 0,
        notes: null,
      });
      if (isRealUser(booking.studentId)) await savePenaltyToDB(penalty);
      penaltyApplied = true;
      penaltyDescription = `Late cancellation penalty of €${(feeCents / 100).toFixed(2)} applied.`;
    }
  }

  // Deduct credits for the promoted waitlist student
  if (cancelResult.promoted?.subscriptionId) {
    const promoSub = await getSubscriptionRepo().getById(cancelResult.promoted.subscriptionId);
    if (promoSub) {
      if (promoSub.productType === "membership" && promoSub.classesPerTerm !== null) {
        await updateSubscription(promoSub.id, { classesUsed: promoSub.classesUsed + 1 });
      } else if (promoSub.remainingCredits !== null) {
        await updateSubscription(promoSub.id, { remainingCredits: promoSub.remainingCredits - 1 });
      }
    }
  }

  // Write-through to Supabase for real users
  if (isRealUser(user.id)) {
    const updatedBooking = svc.bookings.find((b) => b.id === bookingId);
    if (updatedBooking) await saveBookingToDB(updatedBooking);
  }

  // Persist promoted waitlist student's new booking + updated waitlist entry
  if (cancelResult.promoted) {
    const promotedEntry = svc.waitlist.find(
      (w) => w.id === cancelResult.promoted!.waitlistId
    );
    if (promotedEntry && isRealUser(promotedEntry.studentId)) {
      await saveWaitlistToDB(promotedEntry);
      const promotedBooking = svc.bookings.find(
        (b) =>
          b.studentId === promotedEntry.studentId &&
          b.bookableClassId === booking.bookableClassId &&
          b.source === "waitlist_promotion"
      );
      if (promotedBooking) await saveBookingToDB(promotedBooking);
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/penalties");
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  revalidatePath("/students");

  return {
    success: true,
    isLate,
    penaltyApplied,
    penaltyDescription,
  };
}

/**
 * Check whether a cancelled booking can be restored by the student.
 * Returns eligibility info for the UI without performing the restore.
 */
const RESTORE_CUTOFF_MINUTES = 10;

export async function checkRestoreEligibilityAction(
  bookingId: string
): Promise<{
  eligible: boolean;
  reason?: string;
}> {
  if (!bookingId) return { eligible: false, reason: "Missing booking ID" };

  const user = await getAuthUser();
  await ensureOperationalDataHydrated();
  if (!user || user.role !== "student") {
    return { eligible: false, reason: "Not authenticated" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { eligible: false, reason: "Booking not found" };

  if (booking.studentId !== user.id) {
    return { eligible: false, reason: "Not your booking" };
  }

  if (booking.status !== "cancelled" && booking.status !== "late_cancelled") {
    return { eligible: false, reason: "Only cancelled bookings can be restored" };
  }

  if (booking.adminNote === "academy_cancelled") {
    return { eligible: false, reason: "This class was cancelled by the academy and cannot be restored." };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { eligible: false, reason: "This class is no longer available." };

  if (isClassStarted(cls.date, cls.startTime)) {
    return { eligible: false, reason: "Class has already started." };
  }

  const mins = minutesUntilStart(cls.date, cls.startTime);
  if (mins < RESTORE_CUTOFF_MINUTES) {
    return { eligible: false, reason: "Too close to class start. Please speak to reception." };
  }

  const student = await getStudentRepo().getById(user.id);
  const entitlementCheck = await validateRestoreEntitlement(booking, {
    classDate: cls.date,
    studentDateOfBirth: student?.dateOfBirth ?? null,
  });
  if (!entitlementCheck.valid) {
    return { eligible: false, reason: entitlementCheck.reason };
  }

  return { eligible: true };
}

/**
 * Restore a cancelled booking for the current student.
 * Re-consumes the correct entitlement on success.
 */
export async function studentRestoreBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  restoredTo?: "confirmed" | "waitlisted";
  error?: string;
}> {
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const user = await getAuthUser();
  await ensureOperationalDataHydrated();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  if (booking.studentId !== user.id) {
    return { success: false, error: "Not your booking" };
  }

  if (booking.status !== "cancelled" && booking.status !== "late_cancelled") {
    return { success: false, error: "Only cancelled bookings can be restored" };
  }

  if (booking.adminNote === "academy_cancelled") {
    return { success: false, error: "This class was cancelled by the academy and cannot be restored." };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "This class is no longer available." };

  if (isClassStarted(cls.date, cls.startTime)) {
    return { success: false, error: "Cannot restore — class has already started." };
  }

  const mins = minutesUntilStart(cls.date, cls.startTime);
  if (mins < RESTORE_CUTOFF_MINUTES) {
    return { success: false, error: "Too close to class start. Please speak to reception." };
  }

  const student = await getStudentRepo().getById(user.id);
  const entitlementCheck = await validateRestoreEntitlement(booking, {
    classDate: cls.date,
    studentDateOfBirth: student?.dateOfBirth ?? null,
  });
  if (!entitlementCheck.valid) {
    return { success: false, error: entitlementCheck.reason };
  }

  const result = svc.restoreBooking(bookingId);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  const isBirthday = booking.source === "birthday";

  if (result.restoredTo === "confirmed") {
    if (isBirthday) {
      await markBirthdayClassUsed(
        booking.studentId,
        new Date().getFullYear(),
        cls.title,
        cls.date
      );
    } else if (booking.subscriptionId) {
      const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
      if (sub) {
        if (sub.productType === "membership" && sub.classesPerTerm !== null) {
          await updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
        } else if (sub.remainingCredits !== null) {
          await updateSubscription(sub.id, { remainingCredits: sub.remainingCredits - 1 });
        }
      }
    }
  }

  // Write-through to Supabase for real users
  if (isRealUser(user.id)) {
    if (result.restoredTo === "confirmed") {
      const restoredBooking = svc.bookings.find((b) => b.id === bookingId);
      if (restoredBooking) await saveBookingToDB(restoredBooking);
    } else if (result.restoredTo === "waitlisted") {
      const newEntry = svc.waitlist.find((w) => w.studentId === user.id && w.bookableClassId === booking.bookableClassId && w.status === "waiting");
      if (newEntry) await saveWaitlistToDB(newEntry);
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  revalidatePath("/students");

  return {
    success: true,
    restoredTo: result.restoredTo,
  };
}
