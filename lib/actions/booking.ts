"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getSubscriptions, updateSubscription } from "@/lib/services/subscription-store";
import { getInstances } from "@/lib/services/schedule-store";
import { getTerms } from "@/lib/services/term-store";
import { getAccessRulesMap } from "@/config/product-access";
import { STUDENTS, DANCE_STYLES } from "@/lib/mock-data";
import { computeBookability, type BookabilityContext, type ClassInstanceInfo } from "@/lib/domain/bookability";
import { hasAcceptedCurrentVersion } from "@/lib/services/coc-store";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import type { DanceRole } from "@/types/domain";

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
}): Promise<BookingResult> {
  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated as a student." };
  }

  const student = STUDENTS.find(
    (s) => s.fullName === user.fullName || s.email === user.email
  );
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
  const allSubs = getSubscriptions();
  const accessRulesMap = getAccessRulesMap();

  const rawCls = instances.find((c) => c.id === bookableClassId);
  if (!rawCls) return { success: false, error: "Class not found." };

  const style = rawCls.styleName
    ? DANCE_STYLES.find((s) => s.name === rawCls.styleName)
    : null;

  svc.refreshClasses(
    instances.map((bc) => {
      const st = bc.styleName
        ? DANCE_STYLES.find((s) => s.name === bc.styleName)
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
  };

  const studentSubs = allSubs.filter((s) => s.studentId === student.id);
  const ctx: BookabilityContext = {
    classInstance: classInfo,
    studentState: {
      activeBookingId: activeForClass?.id ?? null,
      waitlistEntry: waitlistForClass
        ? { id: waitlistForClass.id, position: waitlistForClass.position }
        : null,
      cancelledBooking: cancelledForClass
        ? { id: cancelledForClass.id, status: cancelledForClass.status }
        : null,
    },
    studentSubscriptions: studentSubs,
    terms,
    accessRulesMap,
    studentPreferredRole: danceRole ?? student.preferredRole,
    codeOfConductAccepted: hasAcceptedCurrentVersion(student.id, CURRENT_CODE_OF_CONDUCT.version),
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
    (e) => e.subscriptionId === subscriptionId
  );
  if (!chosenEntitlement) {
    return { success: false, error: "Selected entitlement is not valid for this class." };
  }

  const sub = allSubs.find((s) => s.id === subscriptionId);
  if (!sub) {
    return { success: false, error: "Subscription not found." };
  }

  const outcome = svc.bookClass({
    bookableClassId,
    studentId: student.id,
    studentName: student.fullName,
    danceRole: danceRole,
    source: "subscription",
    subscriptionId: sub.id,
    subscriptionName: sub.productName,
  });

  if (outcome.type === "rejected") {
    return { success: false, error: outcome.reason };
  }

  if (outcome.type === "confirmed") {
    if (sub.productType === "membership" && sub.classesPerTerm !== null) {
      updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
    } else if (sub.remainingCredits !== null) {
      updateSubscription(sub.id, { remainingCredits: sub.remainingCredits - 1 });
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
