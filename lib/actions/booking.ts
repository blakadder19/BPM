"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getInstances } from "@/lib/services/schedule-store";
import { getTerms } from "@/lib/services/term-store";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { getProductRepo } from "@/lib/repositories";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { computeBookability, type BookabilityContext, type ClassInstanceInfo } from "@/lib/domain/bookability";
import { getSettings } from "@/lib/services/settings-store";

import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { getStudentRepo, getSubscriptionRepo, getCocRepo } from "@/lib/repositories";
import { updateSubscription } from "@/lib/services/subscription-service";
import type { DanceRole } from "@/types/domain";
import { isRealUser } from "@/lib/utils/is-real-user";
import { saveBookingToDB, saveWaitlistToDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { isBirthdayClassUsed, markBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import { isBirthdayWeek, checkBirthdayBenefitEligibility } from "@/lib/domain/member-benefits";
import { dismissNotificationsByType } from "@/lib/communications/notification-store";

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  waitlistId?: string;
  waitlistPosition?: number;
  className?: string;
  date?: string;
  status?: "confirmed" | "waitlisted";
  error?: string;
}

export async function createStudentBooking(input: {
  bookableClassId: string;
  subscriptionId: string;
  danceRole: DanceRole | null;
  useBirthdayBenefit?: boolean;
}): Promise<BookingResult> {
  const user = await getAuthUser();
  await ensureOperationalDataHydrated();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated as a student." };
  }

  const student = await getStudentRepo().getById(user.id);
  if (!student) {
    return { success: false, error: "Student profile not found." };
  }

  const { bookableClassId, subscriptionId, danceRole } = input;
  if (!bookableClassId || !subscriptionId) {
    return { success: false, error: "Missing required fields." };
  }

  const svc = getBookingService();
  const instances = getInstances();
  const terms = getTerms();
  const allSubs = await getSubscriptionRepo().getByStudent(student.id);
  const allProducts = await getProductRepo().getAll();
  const accessRulesMap = buildDynamicAccessRulesMap(allProducts);

  const rawCls = instances.find((c) => c.id === bookableClassId);
  if (!rawCls) return { success: false, error: "Class not found." };

  const danceStyles = getDanceStyles();
  const style = rawCls.styleName
    ? danceStyles.find((s) => s.name === rawCls.styleName)
    : null;

  svc.refreshClasses(
    instances.map((bc) => {
      const st = bc.styleName
        ? danceStyles.find((s) => s.name === bc.styleName)
        : null;
      return {
        id: bc.id,
        title: bc.title,
        classType: bc.classType,
        styleName: bc.styleName,
        danceStyleRequiresBalance: st?.requiresRoleBalance ?? false,
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

  const activeBookings = svc.getBookingsForStudent(student.id);
  const activeForClass = activeBookings.find(
    (b) =>
      b.bookableClassId === bookableClassId &&
      (b.status === "confirmed" || b.status === "checked_in")
  );
  const waitlistEntries = svc.getWaitlistForStudent(student.id);
  const waitlistForClass = waitlistEntries.find(
    (w) => w.bookableClassId === bookableClassId
  );
  const cancelledForClass = !activeForClass
    ? activeBookings.find(
        (b) =>
          b.bookableClassId === bookableClassId &&
          (b.status === "cancelled" || b.status === "late_cancelled")
      )
    : undefined;

  const allBookingsForClass = svc.getConfirmedBookingsForClass(bookableClassId);
  const classInfo: ClassInstanceInfo = {
    id: rawCls.id,
    title: rawCls.title,
    classType: rawCls.classType,
    styleName: rawCls.styleName,
    styleId: rawCls.styleId,
    level: rawCls.level,
    date: rawCls.date,
    startTime: rawCls.startTime,
    endTime: rawCls.endTime,
    status: rawCls.status,
    location: rawCls.location,
    maxCapacity: rawCls.maxCapacity,
    leaderCap: rawCls.leaderCap,
    followerCap: rawCls.followerCap,
    danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
    currentLeaders: allBookingsForClass.filter((b) => b.danceRole === "leader").length,
    currentFollowers: allBookingsForClass.filter((b) => b.danceRole === "follower").length,
    totalBooked: allBookingsForClass.length,
    termBound: rawCls.termBound ?? false,
    termId: rawCls.termId ?? null,
  };

  const cocAccepted = await getCocRepo().hasAcceptedVersion(
    student.id,
    CURRENT_CODE_OF_CONDUCT.version
  );

  const bdayUsed = student.dateOfBirth
    ? await isBirthdayClassUsed(student.id, new Date().getFullYear())
    : false;
  const bdayEligibility = checkBirthdayBenefitEligibility({
    subscriptions: allSubs,
    dateOfBirth: student.dateOfBirth,
    referenceDate: rawCls.date,
    alreadyUsedThisYear: bdayUsed,
  });
  const birthdayBenefit = bdayEligibility.potentiallyEligible
    ? {
        eligible: true as const,
        alreadyUsed: bdayEligibility.alreadyUsed,
        membershipSubscriptionId: bdayEligibility.membershipSubscriptionId!,
      }
    : undefined;

  const ctx: BookabilityContext = {
    classInstance: classInfo,
    studentState: {
      activeBookingId: activeForClass?.id ?? null,
      activeBookingStatus: activeForClass?.status ?? null,
      waitlistEntry: waitlistForClass
        ? { id: waitlistForClass.id, position: waitlistForClass.position }
        : null,
      cancelledBooking: cancelledForClass
        ? { id: cancelledForClass.id, status: cancelledForClass.status }
        : null,
    },
    studentSubscriptions: allSubs,
    terms,
    accessRulesMap,
    studentPreferredRole: danceRole ?? student.preferredRole,
    codeOfConductAccepted: cocAccepted,
    birthdayBenefit,
    studentDateOfBirth: student.dateOfBirth,
    beginnerLevelNames: getSettings().beginnerLevelNames,
  };

  if (!ctx.codeOfConductAccepted) {
    return { success: false, error: "You must accept the Code of Conduct before booking." };
  }

  const result = computeBookability(ctx);

  if (result.status === "blocked" || result.status === "not_bookable") {
    return { success: false, error: result.reason };
  }
  if (result.status === "already_booked") {
    return { success: false, error: "You already have a booking for this class." };
  }
  if (result.status === "already_waitlisted") {
    return { success: false, error: "You are already on the waitlist for this class." };
  }
  if (result.status === "restore_available") {
    return { success: false, error: "You have a cancelled booking for this class. Please restore it instead of creating a new one." };
  }

  if (result.status !== "bookable" && result.status !== "waitlistable") {
    return { success: false, error: "Cannot book this class." };
  }

  const chosenEntitlement = result.entitlements.find(
    (e) => e.subscriptionId === subscriptionId && !!e.isBirthdayBenefit === !!(input.useBirthdayBenefit ?? false)
  );
  if (!chosenEntitlement) {
    return { success: false, error: "Selected entitlement is not valid for this class." };
  }

  const isBirthday = !!chosenEntitlement.isBirthdayBenefit;

  const sub = allSubs.find((s) => s.id === subscriptionId);
  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  if (isBirthday) {
    // Verify the class date is actually within the student's birthday week
    if (!student.dateOfBirth || !isBirthdayWeek(student.dateOfBirth, rawCls.date)) {
      return { success: false, error: "Birthday benefit can only be used for classes during your birthday week." };
    }
    // Double-check birthday redemption hasn't been used since we last checked
    const alreadyUsed = await isBirthdayClassUsed(student.id, new Date().getFullYear());
    if (alreadyUsed) {
      return { success: false, error: "You've already used your birthday free class this year." };
    }
  }

  const outcome = svc.bookClass({
    bookableClassId,
    studentId: student.id,
    studentName: student.fullName,
    danceRole: danceRole ?? student.preferredRole,
    source: isBirthday ? "birthday" : "subscription",
    subscriptionId: sub.id,
    subscriptionName: isBirthday ? "Birthday Free Class" : sub.productName,
  });

  if (outcome.type === "rejected") {
    return { success: false, error: outcome.reason };
  }

  if (outcome.type === "confirmed") {
    if (isBirthday) {
      await markBirthdayClassUsed(student.id, new Date().getFullYear(), rawCls.title, rawCls.date);
      if (isRealUser(student.id)) {
        dismissNotificationsByType(student.id, "birthday_benefit_available").catch(() => {});
      }
    } else {
      if (sub.productType === "membership" && sub.classesPerTerm !== null) {
        await updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
      } else if (sub.remainingCredits !== null) {
        await updateSubscription(sub.id, { remainingCredits: sub.remainingCredits - 1 });
      }
    }
  }

  // Write-through to Supabase for real users
  if (isRealUser(student.id)) {
    if (outcome.type === "confirmed") {
      const booking = svc.bookings.find((b) => b.id === outcome.bookingId);
      if (booking) await saveBookingToDB(booking);
    } else if (outcome.type === "waitlisted") {
      const entry = svc.waitlist.find((w) => w.id === outcome.waitlistId);
      if (entry) await saveWaitlistToDB(entry);
    }
  }

  revalidatePath("/bookings");
  revalidatePath("/classes");
  revalidatePath("/dashboard");

  if (outcome.type === "confirmed") {
    return {
      success: true,
      bookingId: outcome.bookingId,
      className: outcome.className,
      date: outcome.date,
      status: "confirmed",
    };
  }

  return {
    success: true,
    waitlistId: outcome.waitlistId,
    waitlistPosition: outcome.position,
    className: outcome.className,
    date: outcome.date,
    status: "waitlisted",
  };
}
