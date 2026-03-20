"use server";

import { revalidatePath } from "next/cache";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSettings } from "@/lib/services/settings-store";
import { getSubscriptionRepo } from "@/lib/repositories";
import { updateSubscription as repoUpdateSub } from "@/lib/services/subscription-service";
import { getTerms } from "@/lib/services/term-store";
import { findTermForDate, isBeginnerEntryWeek } from "@/lib/domain/term-rules";
import { isBeginnerEntryClass } from "@/lib/domain/term-rules";
import {
  getCancellationContext,
  penaltiesApplyTo,
  penaltyFeeCents,
} from "@/lib/domain/cancellation-rules";
import { isAfterClosureWindow } from "@/lib/domain/datetime";
import type { BookingSource, DanceRole } from "@/types/domain";
import { isRealUser } from "@/lib/utils/is-real-user";
import { saveBookingToDB, saveWaitlistToDB, deleteWaitlistFromDB, savePenaltyToDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { requireRole } from "@/lib/auth";

const VALID_SOURCES = new Set<string>([
  "subscription",
  "drop_in",
  "admin",
  "waitlist_promotion",
]);

export async function adminCreateBookingAction(
  formData: FormData
): Promise<{ success: boolean; outcome?: string; warning?: string; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  const studentId = (formData.get("studentId") as string)?.trim();
  const studentName = (formData.get("studentName") as string)?.trim();
  const bookableClassId = (formData.get("bookableClassId") as string)?.trim();
  const danceRole = (formData.get("danceRole") as string)?.trim() || null;
  const source = (formData.get("source") as string)?.trim();
  const subscriptionName =
    (formData.get("subscriptionName") as string)?.trim() || null;
  const subscriptionId =
    (formData.get("subscriptionId") as string)?.trim() || null;
  const adminNote = (formData.get("adminNote") as string)?.trim() || null;
  const forceConfirm = formData.get("forceConfirm") === "true";

  if (!studentId || !studentName) {
    return { success: false, error: "Student is required" };
  }
  if (!bookableClassId) {
    return { success: false, error: "Class instance is required" };
  }
  if (!source || !VALID_SOURCES.has(source)) {
    return { success: false, error: "Invalid booking source" };
  }
  if (danceRole && danceRole !== "leader" && danceRole !== "follower") {
    return { success: false, error: "Invalid role" };
  }

  const svc = getBookingService();
  const cls = svc.getClass(bookableClassId);

  // Entitlement validation when source is "subscription"
  if (source === "subscription" && subscriptionId) {
    const sub = await getSubscriptionRepo().getById(subscriptionId);
    if (!sub) {
      return { success: false, error: "Entitlement not found" };
    }

    // Term validation: check the class date falls within the entitlement's term
    if (sub.termId && cls) {
      const terms = getTerms();
      const classTerm = findTermForDate(terms, cls.date);
      if (!classTerm || classTerm.id !== sub.termId) {
        return { success: false, error: "Entitlement is not valid for this class date's term" };
      }
    }

    // Credit/class usage validation
    if (sub.productType === "membership" && sub.classesPerTerm !== null) {
      if (sub.classesUsed >= sub.classesPerTerm) {
        return { success: false, error: `All ${sub.classesPerTerm} classes for this term have been used` };
      }
    } else if (sub.remainingCredits !== null && sub.remainingCredits <= 0) {
      return { success: false, error: "No remaining credits on this entitlement" };
    }
  }

  // Beginner restriction (E3 — integrated here per plan)
  // ClassSnapshot doesn't carry level, so we look it up from the schedule store
  const { getInstances } = await import("@/lib/services/schedule-store");
  const allInstances = getInstances();
  const rawInstance = allInstances.find((i) => i.id === bookableClassId);
  const classLevel = rawInstance?.level ?? null;

  if (cls && isBeginnerEntryClass(classLevel)) {
    const terms = getTerms();
    const classTerm = findTermForDate(terms, cls.date);
    if (classTerm && source === "subscription" && subscriptionId) {
      const sub = await getSubscriptionRepo().getById(subscriptionId);
      // Student is "new" to this entitlement if they have no prior confirmed bookings
      // with the same subscription name during this term
      const existingBookings = svc.bookings.filter(
        (b) =>
          b.studentId === studentId &&
          b.subscriptionName === (sub?.productName ?? subscriptionName) &&
          (b.status === "confirmed" || b.status === "checked_in")
      );
      if (existingBookings.length === 0 && !isBeginnerEntryWeek(cls.date, classTerm)) {
        return {
          success: false,
          error: "New beginner students can only start in weeks 1–2 of the term.",
        };
      }
    }
  }

  const result = svc.adminBook({
    bookableClassId,
    studentId,
    studentName,
    danceRole: (danceRole as DanceRole) ?? null,
    source: source as BookingSource,
    subscriptionName,
    adminNote,
    forceConfirm,
  });

  if (result.type === "rejected") {
    return { success: false, error: result.reason };
  }

  // Deduct credit / increment classesUsed on successful booking
  if (source === "subscription" && subscriptionId) {
    const sub = await getSubscriptionRepo().getById(subscriptionId);
    if (sub) {
      if (sub.productType === "membership" && sub.classesPerTerm !== null) {
        await repoUpdateSub(sub.id, { classesUsed: sub.classesUsed + 1 });
      } else if (sub.remainingCredits !== null) {
        await repoUpdateSub(sub.id, { remainingCredits: sub.remainingCredits - 1 });
      }
    }
  }

  if (isRealUser(studentId)) {
    const newBooking = svc.bookings.find((b) => b.studentId === studentId && b.bookableClassId === bookableClassId && (b.status === "confirmed" || b.status === "checked_in"));
    if (newBooking) await saveBookingToDB(newBooking);
  }

  revalidatePath("/bookings");
  revalidatePath("/students");
  return { success: true, outcome: result.type };
}

export async function adminCancelBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  isLate?: boolean;
  penaltyCreated?: boolean;
  promotedStudent?: string | null;
  error?: string;
}> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);

  if (ctx.hasStarted) {
    return { success: false, error: "Cannot cancel — class has already started" };
  }

  const isLate = ctx.isLate;

  const result = svc.cancelBookingAsAdmin(bookingId, isLate);
  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  if (booking.subscriptionId) {
    const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
    if (sub) {
      if (sub.productType === "membership" && sub.classesPerTerm !== null && sub.classesUsed > 0) {
        await repoUpdateSub(sub.id, { classesUsed: sub.classesUsed - 1 });
      } else if (sub.remainingCredits !== null) {
        await repoUpdateSub(sub.id, { remainingCredits: sub.remainingCredits + 1 });
      }
    }
  }

  let penaltyCreated = false;
  if (isLate && penaltiesApplyTo(cls.classType)) {
    const settings = getSettings();
    if (settings.lateCancelPenaltiesEnabled) {
      const penaltySvc = getPenaltyService();
      const penalty = penaltySvc.addPenalty({
        studentId: booking.studentId,
        studentName: booking.studentName,
        bookingId: booking.id,
        bookableClassId: booking.bookableClassId,
        classTitle: cls.title,
        classDate: cls.date,
        reason: "late_cancel",
        amountCents: penaltyFeeCents("late_cancel"),
        resolution: "monetary_pending",
        subscriptionId: null,
        creditDeducted: 0,
        notes: null,
      });
      if (isRealUser(booking.studentId)) await savePenaltyToDB(penalty);
      penaltyCreated = true;
    }
  }

  if (isRealUser(booking.studentId)) {
    const cancelledBooking = svc.bookings.find((b) => b.id === bookingId);
    if (cancelledBooking) await saveBookingToDB(cancelledBooking);
  }
  if (result.promoted) {
    const promotedEntry = svc.waitlist.find((w) => w.id === result.promoted?.waitlistId);
    if (promotedEntry && isRealUser(promotedEntry.studentId)) {
      await saveWaitlistToDB(promotedEntry);
      const promotedBooking = svc.bookings.find(
        (b) => b.studentId === promotedEntry.studentId && b.bookableClassId === booking.bookableClassId && b.source === "waitlist_promotion"
      );
      if (promotedBooking) await saveBookingToDB(promotedBooking);
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/penalties");
  revalidatePath("/dashboard");
  revalidatePath("/classes");
  revalidatePath("/students");
  return {
    success: true,
    isLate,
    penaltyCreated,
    promotedStudent: result.promoted?.studentName ?? null,
  };
}

export async function adminCheckInBookingAction(
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin", "teacher"]);

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (cls && isAfterClosureWindow(cls.date, cls.startTime)) {
    return { success: false, error: "Check-in window has closed (60 min after class start)" };
  }

  const result = svc.checkInBooking(bookingId);
  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  if (cls) {
    const attendanceSvc = getAttendanceService();
    attendanceSvc.markAttendance({
      bookableClassId: booking.bookableClassId,
      studentId: booking.studentId,
      studentName: booking.studentName,
      bookingId: booking.id,
      classTitle: cls.title,
      date: cls.date,
      status: "present",
      markedBy: "admin",
      checkInMethod: "manual",
    });
  }

  if (isRealUser(booking.studentId)) {
    const checkedIn = svc.bookings.find((b) => b.id === bookingId);
    if (checkedIn) await saveBookingToDB(checkedIn);
  }

  revalidatePath("/bookings");
  revalidatePath("/attendance");
  return { success: true };
}

export async function adminPromoteWaitlistAction(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  if (!waitlistId) return { success: false, error: "Missing waitlist ID" };

  const svc = getBookingService();
  const result = svc.promoteFromWaitlist(waitlistId);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  if (result.type === "promoted") {
    const newBooking = svc.bookings.find((b) => b.id === result.bookingId);
    if (newBooking && isRealUser(newBooking.studentId)) await saveBookingToDB(newBooking);
    const promotedEntry = svc.waitlist.find((w) => w.id === waitlistId);
    if (promotedEntry) await saveWaitlistToDB(promotedEntry);
  }

  revalidatePath("/bookings");
  return { success: true };
}

export async function adminRemoveFromWaitlistAction(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  if (!waitlistId) return { success: false, error: "Missing waitlist ID" };

  const svc = getBookingService();
  const removed = svc.removeFromWaitlist(waitlistId);

  if (!removed) return { success: false, error: "Entry not found or already promoted" };

  await deleteWaitlistFromDB(waitlistId);

  revalidatePath("/bookings");
  return { success: true };
}

export async function checkLateCancelStatusAction(
  bookingId: string
): Promise<{
  success: boolean;
  isLate?: boolean;
  hasStarted?: boolean;
  classStart?: string;
  cutoffMinutes?: number;
  minutesUntilStart?: number;
  lateCancelFeeCents?: number;
  error?: string;
}> {
  await ensureOperationalDataHydrated();

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);

  return {
    success: true,
    isLate: ctx.isLate,
    hasStarted: ctx.hasStarted,
    classStart: ctx.classStart.toISOString(),
    cutoffMinutes: ctx.cutoffMinutes,
    minutesUntilStart: ctx.minutesUntilStart,
    lateCancelFeeCents: penaltyFeeCents("late_cancel"),
  };
}

export async function adminRestoreBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  restoredTo?: string;
  hasLinkedPenalty?: boolean;
  error?: string;
}> {
  await ensureOperationalDataHydrated();
  await requireRole(["admin"]);

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (cls) {
    const ctx = getCancellationContext(cls.date, cls.startTime);
    if (ctx.hasStarted) {
      return { success: false, error: "Cannot restore — class has already started" };
    }
  }

  const result = svc.restoreBooking(bookingId);

  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  if (result.restoredTo === "confirmed" && booking.subscriptionId) {
    const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
    if (sub) {
      if (sub.productType === "membership" && sub.classesPerTerm !== null) {
        await repoUpdateSub(sub.id, { classesUsed: sub.classesUsed + 1 });
      } else if (sub.remainingCredits !== null) {
        await repoUpdateSub(sub.id, { remainingCredits: sub.remainingCredits - 1 });
      }
    }
  }

  const penaltySvc = getPenaltyService();
  const allPenalties = penaltySvc.getAllPenalties();
  const hasLinkedPenalty = allPenalties.some((p) => p.bookingId === bookingId);

  if (isRealUser(booking.studentId)) {
    const restoredBooking = svc.bookings.find((b) => b.id === bookingId);
    if (restoredBooking) await saveBookingToDB(restoredBooking);
  }

  revalidatePath("/bookings");
  revalidatePath("/penalties");
  revalidatePath("/dashboard");
  revalidatePath("/classes");

  return {
    success: true,
    restoredTo: result.restoredTo,
    hasLinkedPenalty,
  };
}
