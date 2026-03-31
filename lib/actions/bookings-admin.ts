"use server";

import { revalidatePath } from "next/cache";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSettings } from "@/lib/services/settings-store";
import { getSubscriptionRepo, getTermRepo } from "@/lib/repositories";
import { updateSubscription as repoUpdateSub } from "@/lib/services/subscription-service";
import { findTermForDate, getTermWeekNumber, isDateInTerm } from "@/lib/domain/term-rules";
import {
  getCancellationContext,
  penaltiesApplyTo,
  penaltyFeeCents,
} from "@/lib/domain/cancellation-rules";
import { isAfterClosureWindow, isClassEnded } from "@/lib/domain/datetime";
import type { BookingSource, DanceRole } from "@/types/domain";
import { isRealUser } from "@/lib/utils/is-real-user";
import { saveBookingToDB, saveWaitlistToDB, deleteWaitlistFromDB, savePenaltyToDB, saveAttendanceToDB, deleteBookingFromDB, deleteAttendanceFromDB, deletePenaltyFromDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { requireRole, requireAuth } from "@/lib/auth";
import { getInstances } from "@/lib/services/schedule-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";

function syncClassMap() {
  const svc = getBookingService();
  const instances = getInstances();
  svc.refreshClasses(
    instances.map((bc) => {
      const style = bc.styleName
        ? getDanceStyles().find((s) => s.name === bc.styleName)
        : null;
      return {
        id: bc.id,
        title: bc.title,
        classType: bc.classType,
        styleName: bc.styleName,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
        status: bc.status,
        date: bc.date,
        startTime: bc.startTime,
        endTime: bc.endTime,
        maxCapacity: bc.maxCapacity,
        leaderCap: bc.leaderCap,
        followerCap: bc.followerCap,
        location: bc.location,
      };
    })
  );
}

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
  syncClassMap();
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

  const { getInstances: getInst } = await import("@/lib/services/schedule-store");
  const allInstances = getInst();
  const rawInstance = allInstances.find((i) => i.id === bookableClassId);

  // Entitlement validation when source is "subscription"
  if (source === "subscription" && !subscriptionId) {
    return { success: false, error: "A subscription must be selected when booking source is Subscription" };
  }
  if (source === "subscription" && subscriptionId) {
    const sub = await getSubscriptionRepo().getById(subscriptionId);
    if (!sub) {
      return { success: false, error: "Entitlement not found" };
    }

    // Access rule validation: style, class type, level
    const { buildDynamicAccessRulesMap } = await import("@/config/product-access");
    const { canAccessClass } = await import("@/lib/domain/product-access");
    const { getProductRepo } = await import("@/lib/repositories");
    const allProducts = await getProductRepo().getAll();
    const accessRulesMap = buildDynamicAccessRulesMap(allProducts, getDanceStyles());
    const accessRule = accessRulesMap.get(sub.productId);
    if (rawInstance) {
      const classStyleId = rawInstance.styleId ?? (
        rawInstance.styleName
          ? getDanceStyles().find((s) => s.name === rawInstance.styleName)?.id ?? null
          : null
      );
      if (accessRule) {
        const accessResult = canAccessClass(
          accessRule,
          sub.selectedStyleId,
          sub.selectedStyleIds,
          {
            classType: rawInstance.classType,
            danceStyleId: classStyleId,
            level: rawInstance.level ?? null,
          }
        );
        if (!accessResult.granted) {
          return {
            success: false,
            error: `This subscription cannot be used for this class: ${accessResult.reason}.`,
          };
        }
      }
    }

    // Term / validity date validation: use the subscription's own validFrom/validUntil
    // which correctly spans multiple terms for products like Beginners 1 & 2 Promo Pass
    if (sub.termId && cls) {
      if (sub.validFrom && sub.validUntil) {
        if (cls.date < sub.validFrom || cls.date > sub.validUntil) {
          return {
            success: false,
            error: `Entitlement is not valid for this class date — it covers ${sub.validFrom} to ${sub.validUntil}.`,
          };
        }
      } else {
        const subTerm = await getTermRepo().getById(sub.termId);
        if (subTerm && !isDateInTerm(cls.date, subTerm)) {
          return {
            success: false,
            error: `Entitlement is not valid for this class date — the assigned term "${subTerm.name}" runs ${subTerm.startDate} to ${subTerm.endDate}.`,
          };
        }
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

  // Event-type bookability gate
  if (rawInstance) {
    const { CLASS_TYPE_CONFIG } = await import("@/config/event-types");
    const typeConfig = CLASS_TYPE_CONFIG[rawInstance.classType];
    if (!typeConfig.bookable) {
      return {
        success: false,
        error: `${typeConfig.label} events are not bookable. Use Attendance to record participation instead.`,
      };
    }
  }

  // Time gate — admin can book during live window but not after class ends
  if (rawInstance && isClassEnded(rawInstance.date, rawInstance.endTime)) {
    return { success: false, error: "Class has ended — use attendance correction instead of new booking" };
  }

  // Term restriction — only applies when the instance has enforcement enabled
  const isTermBound = rawInstance?.termBound ?? false;

  if (isTermBound && cls) {
    const linkedTermId = rawInstance?.termId;
    let classTerm = linkedTermId
      ? await getTermRepo().getById(linkedTermId)
      : null;
    if (!classTerm) {
      const allTerms = await getTermRepo().getAll();
      classTerm = findTermForDate(allTerms, cls.date);
    }
    if (classTerm) {
      const settings = getSettings();
      const weekNumber = getTermWeekNumber(cls.date, classTerm);

      if (!settings.allowAdminLateEntryIntoTermBound && weekNumber > 1) {
        return {
          success: false,
          error: "Admin late entry into term-bound courses is disabled in settings.",
        };
      }

      if (weekNumber > settings.adminLateEntryMaxClassNumber) {
        return {
          success: false,
          error: `This course is in week ${weekNumber} of the term. Admin late entry is only allowed up to week ${settings.adminLateEntryMaxClassNumber}.`,
        };
      }
    }
  }

  const { getAttendanceService } = await import("@/lib/services/attendance-store");
  const attSvc = getAttendanceService();
  const existingManualAtt = attSvc.records.find(
    (r) =>
      r.bookableClassId === bookableClassId &&
      r.studentId === studentId &&
      !r.bookingId
  );
  if (existingManualAtt) {
    return {
      success: false,
      error: "This student already has a manual attendance record for this class. Use the existing attendance record instead of creating a duplicate booking.",
    };
  }

  const result = svc.adminBook({
    bookableClassId,
    studentId,
    studentName,
    danceRole: (danceRole as DanceRole) ?? null,
    source: source as BookingSource,
    subscriptionId,
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
  syncClassMap();
  await requireRole(["admin"]);

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);

  if (isClassEnded(cls.date, cls.endTime)) {
    return { success: false, error: "Cannot cancel — class has ended" };
  }

  const isLate = ctx.isLate || ctx.hasStarted;

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

  // Sync attendance — remove attendance record tied to this booking
  const attSvc = getAttendanceService();
  const linkedAtt = attSvc.deleteByBookingId(bookingId);
  if (linkedAtt && isRealUser(booking.studentId)) {
    await deleteAttendanceFromDB(linkedAtt.id);
  }

  if (isRealUser(booking.studentId)) {
    const cancelledBooking = svc.bookings.find((b) => b.id === bookingId);
    if (cancelledBooking) await saveBookingToDB(cancelledBooking);
  }
  if (result.promoted) {
    if (result.promoted.subscriptionId) {
      const promoSub = await getSubscriptionRepo().getById(result.promoted.subscriptionId);
      if (promoSub) {
        if (promoSub.productType === "membership" && promoSub.classesPerTerm !== null) {
          await repoUpdateSub(promoSub.id, { classesUsed: promoSub.classesUsed + 1 });
        } else if (promoSub.remainingCredits !== null) {
          await repoUpdateSub(promoSub.id, { remainingCredits: promoSub.remainingCredits - 1 });
        }
      }
    }
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
  revalidatePath("/attendance");
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
  syncClassMap();
  await requireRole(["admin", "teacher"]);

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (cls && isAfterClosureWindow(cls.date, cls.startTime, getSettings().attendanceClosureMinutes)) {
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

    if (isRealUser(booking.studentId)) {
      const attRecord = attendanceSvc.getRecord(booking.bookableClassId, booking.studentId);
      if (attRecord) await saveAttendanceToDB(attRecord);
    }
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
    if (result.subscriptionId) {
      const promoSub = await getSubscriptionRepo().getById(result.subscriptionId);
      if (promoSub) {
        if (promoSub.productType === "membership" && promoSub.classesPerTerm !== null) {
          await repoUpdateSub(promoSub.id, { classesUsed: promoSub.classesUsed + 1 });
        } else if (promoSub.remainingCredits !== null) {
          await repoUpdateSub(promoSub.id, { remainingCredits: promoSub.remainingCredits - 1 });
        }
      }
    }
    const newBooking = svc.bookings.find((b) => b.id === result.bookingId);
    if (newBooking && isRealUser(newBooking.studentId)) await saveBookingToDB(newBooking);
    const promotedEntry = svc.waitlist.find((w) => w.id === waitlistId);
    if (promotedEntry) await saveWaitlistToDB(promotedEntry);
  }

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/classes");
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
  await requireAuth();
  await ensureOperationalDataHydrated();
  syncClassMap();

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const ctx = getCancellationContext(cls.date, cls.startTime);

  if (isNaN(ctx.classStart.getTime())) {
    return { success: false, error: "Invalid class date/time data" };
  }

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
  syncClassMap();
  await requireRole(["admin"]);

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  if (cls && isClassEnded(cls.date, cls.endTime)) {
    return { success: false, error: "Cannot restore — class has ended" };
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

// ── Consequence computation ─────────────────────────────────

export interface BookingConsequences {
  bookingStatus: string;
  bookingSource: string;
  studentName: string;
  classTitle: string;
  classDate: string;
  classStartTime: string;
  isOrphaned: boolean;
  isLate: boolean;
  hasStarted: boolean;
  cutoffMinutes: number;
  minutesUntilStart: number;
  lateCancelFeeCents: number;
  lateCancelPenaltiesEnabled: boolean;
  hasSubscription: boolean;
  subscriptionName: string | null;
  subscriptionType: string | null;
  currentClassesUsed: number | null;
  classesPerTerm: number | null;
  currentRemainingCredits: number | null;
  willRefundCredit: boolean;
  refundDescription: string | null;
  hasLinkedAttendance: boolean;
  attendanceStatus: string | null;
  hasLinkedPenalty: boolean;
  penaltyId: string | null;
  penaltyReason: string | null;
  penaltyAmountCents: number | null;
  waitlistCount: number;
}

export async function computeBookingConsequencesAction(
  bookingId: string
): Promise<{ success: boolean; consequences?: BookingConsequences; error?: string }> {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();
  syncClassMap();

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const cls = svc.getClass(booking.bookableClassId);
  const isOrphaned = !cls;

  const ctx = cls
    ? getCancellationContext(cls.date, cls.startTime)
    : null;
  const isLate = ctx ? !isNaN(ctx.classStart.getTime()) && ctx.isLate : false;
  const hasStarted = ctx ? !isNaN(ctx.classStart.getTime()) && ctx.hasStarted : false;

  const settings = getSettings();

  const isActive = booking.status === "confirmed" || booking.status === "checked_in";

  let hasSubscription = false;
  let subscriptionName: string | null = null;
  let subscriptionType: string | null = null;
  let currentClassesUsed: number | null = null;
  let classesPerTerm: number | null = null;
  let currentRemainingCredits: number | null = null;
  let willRefundCredit = false;
  let refundDescription: string | null = null;

  if (booking.subscriptionId) {
    const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
    if (sub) {
      hasSubscription = true;
      subscriptionName = sub.productName;
      subscriptionType = sub.productType;

      if (sub.productType === "membership" && sub.classesPerTerm !== null) {
        currentClassesUsed = sub.classesUsed;
        classesPerTerm = sub.classesPerTerm;
        if (isActive && sub.classesUsed > 0) {
          willRefundCredit = true;
          refundDescription = `Usage will go from ${sub.classesUsed}/${sub.classesPerTerm} to ${sub.classesUsed - 1}/${sub.classesPerTerm}`;
        }
      } else if (sub.remainingCredits !== null) {
        currentRemainingCredits = sub.remainingCredits;
        if (isActive) {
          willRefundCredit = true;
          refundDescription = `Credits will go from ${sub.remainingCredits} to ${sub.remainingCredits + 1}`;
        }
      }
    }
  }

  const attSvc = getAttendanceService();
  const attRecord = attSvc.getAllRecords().find((r) => r.bookingId === bookingId);

  const penaltySvc = getPenaltyService();
  const linkedPenalty = penaltySvc.getAllPenalties().find((p) => p.bookingId === bookingId);

  const waitlistEntries = svc.waitlist.filter(
    (w) => w.bookableClassId === booking.bookableClassId && w.status === "waiting"
  );

  return {
    success: true,
    consequences: {
      bookingStatus: booking.status,
      bookingSource: booking.source,
      studentName: booking.studentName,
      classTitle: cls?.title ?? "(Deleted class)",
      classDate: cls?.date ?? "",
      classStartTime: cls?.startTime ?? "",
      isOrphaned,
      isLate,
      hasStarted,
      cutoffMinutes: ctx?.cutoffMinutes ?? 0,
      minutesUntilStart: ctx && !isNaN(ctx.classStart.getTime()) ? ctx.minutesUntilStart : 0,
      lateCancelFeeCents: penaltyFeeCents("late_cancel"),
      lateCancelPenaltiesEnabled: settings.lateCancelPenaltiesEnabled ?? false,
      hasSubscription,
      subscriptionName,
      subscriptionType,
      currentClassesUsed,
      classesPerTerm,
      currentRemainingCredits,
      willRefundCredit,
      refundDescription,
      hasLinkedAttendance: !!attRecord,
      attendanceStatus: attRecord?.status ?? null,
      hasLinkedPenalty: !!linkedPenalty,
      penaltyId: linkedPenalty?.id ?? null,
      penaltyReason: linkedPenalty?.reason ?? null,
      penaltyAmountCents: linkedPenalty?.amountCents ?? null,
      waitlistCount: waitlistEntries.length,
    },
  };
}

// ── Delete booking ──────────────────────────────────────────

export async function adminDeleteBookingAction(
  bookingId: string
): Promise<{
  success: boolean;
  deletedAttendance?: boolean;
  deletedPenalty?: boolean;
  refundedCredit?: boolean;
  error?: string;
}> {
  await ensureOperationalDataHydrated();
  syncClassMap();
  await requireRole(["admin"]);

  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  const isActive = booking.status === "confirmed" || booking.status === "checked_in";

  let refundedCredit = false;
  if (isActive && booking.subscriptionId) {
    const sub = await getSubscriptionRepo().getById(booking.subscriptionId);
    if (sub) {
      if (sub.productType === "membership" && sub.classesPerTerm !== null && sub.classesUsed > 0) {
        await repoUpdateSub(sub.id, { classesUsed: sub.classesUsed - 1 });
        refundedCredit = true;
      } else if (sub.remainingCredits !== null) {
        await repoUpdateSub(sub.id, { remainingCredits: sub.remainingCredits + 1 });
        refundedCredit = true;
      }
    }
  }

  const attSvc = getAttendanceService();
  const deletedAtt = attSvc.deleteByBookingId(bookingId);
  if (deletedAtt && isRealUser(booking.studentId)) {
    await deleteAttendanceFromDB(deletedAtt.id);
  }

  const penaltySvc = getPenaltyService();
  const linkedPenalty = penaltySvc.getAllPenalties().find((p) => p.bookingId === bookingId);
  let deletedPenalty = false;
  if (linkedPenalty) {
    penaltySvc.deletePenalty(linkedPenalty.id);
    if (isRealUser(booking.studentId)) {
      await deletePenaltyFromDB(linkedPenalty.id);
    }
    deletedPenalty = true;
  }

  svc.deleteBooking(bookingId);
  if (isRealUser(booking.studentId)) {
    await deleteBookingFromDB(bookingId);
  }

  revalidatePath("/bookings");
  revalidatePath("/attendance");
  revalidatePath("/penalties");
  revalidatePath("/dashboard");
  revalidatePath("/classes");
  revalidatePath("/students");

  return {
    success: true,
    deletedAttendance: !!deletedAtt,
    deletedPenalty,
    refundedCredit,
  };
}
