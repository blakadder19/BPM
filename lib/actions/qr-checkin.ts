"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getStudentRepo, getSubscriptionRepo, getTermRepo, getProductRepo } from "@/lib/repositories";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getInstances } from "@/lib/services/schedule-store";
import { isValidStudentQrToken } from "@/lib/domain/checkin-token";
import { getTodayStr, isClassEnded } from "@/lib/domain/datetime";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { saveBookingToDB, saveAttendanceToDB } from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";
import { isCheckableStatus } from "@/lib/domain/checkin-rules";
import { isEntitlementValidForClass } from "@/lib/domain/entitlement-rules";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { createSubscription, updateSubscription } from "@/lib/services/subscription-service";
import type { CheckInMethod, DanceRole } from "@/types/domain";

export interface QrEntitlementDetail {
  subscriptionId: string;
  productName: string;
  productType: string;
  classesUsed: number;
  classesPerTerm: number | null;
  remainingCredits: number | null;
  totalCredits: number | null;
  termName: string | null;
  paymentStatus: string;
  status: string;
  validUntil: string | null;
}

export interface QrStudentBooking {
  bookingId: string;
  classId: string;
  classTitle: string;
  startTime: string;
  endTime: string;
  location: string;
  bookingStatus: string;
  danceRole: string | null;
  subscriptionName: string | null;
  entitlement: QrEntitlementDetail | null;
  isCheckedIn: boolean;
  canCheckIn: boolean;
}

export interface QrTodayClass {
  classId: string;
  classTitle: string;
  startTime: string;
  endTime: string;
  location: string;
  styleName: string | null;
  /** null when no valid entitlement covers this class */
  matchingSubscriptionId: string | null;
  matchingSubscriptionName: string | null;
  paymentStatus: string | null;
  hasEntitlement: boolean;
}

/** @deprecated kept temporarily — use QrTodayClass instead */
export type QrCompatibleClass = QrTodayClass;

export interface QrLookupResult {
  success: boolean;
  error?: string;
  student?: {
    id: string;
    name: string;
    email: string;
  };
  todayBookings?: QrStudentBooking[];
  todayClasses?: QrTodayClass[];
  /** @deprecated use todayClasses */
  compatibleClasses?: QrTodayClass[];
  entitlements?: QrEntitlementDetail[];
  recentExpiredEntitlement?: QrEntitlementDetail | null;
  paymentPending?: boolean;
  hasActiveEntitlement?: boolean;
}

export async function lookupStudentByQrAction(token: string): Promise<QrLookupResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  if (!token || !isValidStudentQrToken(token)) {
    return { success: false, error: "Invalid QR code format" };
  }

  await ensureOperationalDataHydrated();

  const allStudents = await getStudentRepo().getAll();
  const student = allStudents.find((s) => s.qrToken === token);
  if (!student) {
    return { success: false, error: "Student not found for this QR code" };
  }

  const today = getTodayStr();
  const bookingSvc = getBookingService();
  const attSvc = getAttendanceService();
  const allInstances = getInstances();

  const todayInstances = new Map(
    allInstances
      .filter((c) => c.date === today && !isClassEnded(c.date, c.endTime))
      .map((c) => [c.id, c])
  );

  const TERMINAL = new Set(["cancelled", "late_cancelled"]);
  const studentBookings = bookingSvc.bookings.filter(
    (b) => b.studentId === student.id && todayInstances.has(b.bookableClassId) && !TERMINAL.has(b.status)
  );

  const allSubs = await getSubscriptionRepo().getAll();
  const studentSubs = allSubs.filter((s) => s.studentId === student.id);

  const allTerms = await getTermRepo().getAll();
  const termMap = new Map(allTerms.map((t) => [t.id, t.name]));

  const subMap = new Map(studentSubs.map((s) => [s.id, s]));

  function buildEntitlementDetail(sub: typeof studentSubs[number]): QrEntitlementDetail {
    return {
      subscriptionId: sub.id,
      productName: sub.productName,
      productType: sub.productType,
      classesUsed: sub.classesUsed,
      classesPerTerm: sub.classesPerTerm,
      remainingCredits: sub.remainingCredits,
      totalCredits: sub.totalCredits,
      termName: sub.termId ? (termMap.get(sub.termId) ?? null) : null,
      paymentStatus: sub.paymentStatus,
      status: sub.status,
      validUntil: sub.validUntil,
    };
  }

  const todayBookings: QrStudentBooking[] = studentBookings.map((b) => {
    const cls = todayInstances.get(b.bookableClassId)!;
    const attRecord = attSvc.getRecord(b.bookableClassId, b.studentId);
    const isCheckedIn = b.status === "checked_in" || attRecord?.status === "present" || attRecord?.status === "late";
    const sub = b.subscriptionId ? subMap.get(b.subscriptionId) : undefined;
    return {
      bookingId: b.id,
      classId: b.bookableClassId,
      classTitle: cls.title,
      startTime: cls.startTime,
      endTime: cls.endTime,
      location: cls.location,
      bookingStatus: b.status,
      danceRole: b.danceRole,
      subscriptionName: b.subscriptionName,
      entitlement: sub ? buildEntitlementDetail(sub) : null,
      isCheckedIn: !!isCheckedIn,
      canCheckIn: isCheckableStatus(b.status),
    };
  });

  const hasActiveEntitlement = studentSubs.some(
    (s) => s.status === "active" && s.validFrom <= today && (!s.validUntil || s.validUntil >= today)
  );
  const paymentPending = studentSubs.some((s) => s.paymentStatus === "pending");

  const activeEntitlements = studentSubs
    .filter((s) => s.status === "active" && s.validFrom <= today && (!s.validUntil || s.validUntil >= today))
    .map(buildEntitlementDetail);

  let recentExpiredEntitlement: QrEntitlementDetail | null = null;
  if (!hasActiveEntitlement) {
    const TERMINAL_STATUSES = new Set(["expired", "exhausted", "cancelled"]);
    const recent = studentSubs
      .filter((s) => TERMINAL_STATUSES.has(s.status))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    if (recent) {
      recentExpiredEntitlement = buildEntitlementDetail(recent);
    }
  }

  const allProducts = await getProductRepo().getAll();
  const danceStylesModule = require("@/lib/services/dance-style-store");
  const danceStyles: { id: string; name: string }[] = danceStylesModule.getDanceStyles?.() ?? [];
  const accessRulesMap = buildDynamicAccessRulesMap(
    allProducts.map((p) => ({
      id: p.id,
      name: p.name,
      productType: p.productType,
      allowedLevels: p.allowedLevels ?? null,
      allowedStyleIds: p.allowedStyleIds ?? null,
    })),
    danceStyles,
  );

  const todayClasses: QrTodayClass[] = [];
  const bookedClassIds = new Set(studentBookings.map((b) => b.bookableClassId));
  for (const [classId, cls] of todayInstances) {
    if (bookedClassIds.has(classId)) continue;
    if (cls.status === "cancelled") continue;

    const classCtx = {
      classType: cls.classType,
      styleName: cls.styleName ?? null,
      styleId: cls.styleId ?? null,
      level: cls.level ?? null,
      date: cls.date,
    };

    let matchedSub: typeof studentSubs[number] | null = null;
    for (const sub of studentSubs) {
      if (sub.status !== "active") continue;
      const rule = accessRulesMap.get(sub.productId);
      if (isEntitlementValidForClass(sub, classCtx, allTerms, rule)) {
        matchedSub = sub;
        break;
      }
    }

    todayClasses.push({
      classId: cls.id,
      classTitle: cls.title,
      startTime: cls.startTime,
      endTime: cls.endTime,
      location: cls.location,
      styleName: cls.styleName ?? null,
      matchingSubscriptionId: matchedSub?.id ?? null,
      matchingSubscriptionName: matchedSub?.productName ?? null,
      paymentStatus: matchedSub?.paymentStatus ?? null,
      hasEntitlement: !!matchedSub,
    });
  }

  return {
    success: true,
    student: {
      id: student.id,
      name: student.fullName,
      email: student.email,
    },
    todayBookings,
    todayClasses,
    compatibleClasses: todayClasses,
    entitlements: activeEntitlements,
    recentExpiredEntitlement,
    paymentPending,
    hasActiveEntitlement,
  };
}

export interface QrCheckInResult {
  success: boolean;
  error?: string;
  classTitle?: string;
}

export async function qrCheckInBookingAction(bookingId: string): Promise<QrCheckInResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };

  if (!isCheckableStatus(booking.status)) {
    if (booking.status === "checked_in") {
      return { success: false, error: "Already checked in" };
    }
    return { success: false, error: `Cannot check in a ${booking.status} booking` };
  }

  let cls = svc.getClass(booking.bookableClassId);
  if (!cls) {
    const allInstances = getInstances();
    const inst = allInstances.find((c) => c.id === booking.bookableClassId);
    if (inst) {
      cls = {
        id: inst.id,
        title: inst.title,
        classType: inst.classType,
        styleName: inst.styleName,
        danceStyleRequiresBalance: false,
        status: inst.status,
        date: inst.date,
        startTime: inst.startTime,
        endTime: inst.endTime,
        maxCapacity: inst.maxCapacity,
        leaderCap: inst.leaderCap,
        followerCap: inst.followerCap,
        location: inst.location,
      };
    }
  }
  if (!cls) return { success: false, error: "Class not found" };

  const result = svc.checkInBooking(bookingId);
  if (result.type === "error") {
    return { success: false, error: result.reason };
  }

  const attSvc = getAttendanceService();
  attSvc.markAttendance({
    bookableClassId: booking.bookableClassId,
    studentId: booking.studentId,
    studentName: booking.studentName,
    bookingId: booking.id,
    classTitle: cls.title,
    date: cls.date,
    status: "present",
    checkInMethod: "qr" as CheckInMethod,
    markedBy: user.fullName,
  });

  if (isRealUser(booking.studentId)) {
    const checkedIn = svc.bookings.find((b) => b.id === bookingId);
    if (checkedIn) await saveBookingToDB(checkedIn);
    const attRecord = attSvc.getRecord(booking.bookableClassId, booking.studentId);
    if (attRecord) await saveAttendanceToDB(attRecord);
  }

  revalidatePath("/attendance");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");

  return { success: true, classTitle: cls.title };
}

export async function qrWalkInCheckInAction(
  studentId: string,
  classId: string,
  subscriptionId: string,
): Promise<QrCheckInResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  const allInstances = getInstances();
  const cls = allInstances.find((c) => c.id === classId);
  if (!cls) return { success: false, error: "Class not found" };

  const today = getTodayStr();
  if (cls.date !== today) return { success: false, error: "Class is not today" };

  const allStudents = await getStudentRepo().getAll();
  const student = allStudents.find((s) => s.id === studentId);
  if (!student) return { success: false, error: "Student not found" };

  const svc = getBookingService();
  const existing = svc.bookings.find(
    (b) => b.studentId === studentId && b.bookableClassId === classId && b.status !== "cancelled" && b.status !== "late_cancelled"
  );
  if (existing) {
    return { success: false, error: "Student already has a booking for this class. Use the booking check-in instead." };
  }

  const bookingId = `walk-in-${studentId}-${classId}-${Date.now()}`;
  const newBooking = {
    id: bookingId,
    studentId,
    studentName: student.fullName,
    bookableClassId: classId,
    subscriptionId,
    subscriptionName: null as string | null,
    status: "checked_in" as const,
    danceRole: null as DanceRole | null,
    source: "admin" as const,
    adminNote: "Walk-in check-in via QR scan",
    bookedAt: new Date().toISOString(),
    cancelledAt: null,
    checkInToken: null,
  };

  svc.bookings.push(newBooking);

  const attSvc = getAttendanceService();
  attSvc.markAttendance({
    bookableClassId: classId,
    studentId,
    studentName: student.fullName,
    bookingId,
    classTitle: cls.title,
    date: cls.date,
    status: "present",
    checkInMethod: "qr" as CheckInMethod,
    markedBy: user.fullName,
  });

  if (isRealUser(studentId)) {
    await saveBookingToDB(newBooking);
    const attRecord = attSvc.getRecord(classId, studentId);
    if (attRecord) await saveAttendanceToDB(attRecord);
  }

  revalidatePath("/attendance");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");

  return { success: true, classTitle: cls.title };
}

export async function qrMarkPaidAndCheckInAction(
  bookingId: string,
  subscriptionId: string,
): Promise<QrCheckInResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  await updateSubscription(subscriptionId, {
    paymentStatus: "paid",
    paymentMethod: "cash",
    paidAt: new Date().toISOString(),
    collectedBy: user.fullName,
  });

  return qrCheckInBookingAction(bookingId);
}

export async function qrMarkPaidAndWalkInAction(
  studentId: string,
  classId: string,
  subscriptionId: string,
): Promise<QrCheckInResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  await updateSubscription(subscriptionId, {
    paymentStatus: "paid",
    paymentMethod: "cash",
    paidAt: new Date().toISOString(),
    collectedBy: user.fullName,
  });

  return qrWalkInCheckInAction(studentId, classId, subscriptionId);
}

export async function qrSellDropInAndCheckInAction(
  studentId: string,
  classId: string,
): Promise<QrCheckInResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  const allProducts = await getProductRepo().getAll();
  const dropInProduct = allProducts.find((p) => p.productType === "drop_in" && p.isActive);
  if (!dropInProduct) {
    return { success: false, error: "No active drop-in product found. Create one in Settings first." };
  }

  const today = getTodayStr();
  const subResult = await createSubscription({
    studentId,
    productId: dropInProduct.id,
    productName: dropInProduct.name,
    productType: "drop_in" as const,
    status: "active" as const,
    totalCredits: dropInProduct.totalCredits ?? 1,
    remainingCredits: dropInProduct.totalCredits ?? 1,
    validFrom: today,
    validUntil: null,
    notes: "Sold via QR check-in",
    termId: null,
    paymentMethod: "cash" as const,
    paymentStatus: "paid" as const,
    assignedBy: user.fullName,
    assignedAt: new Date().toISOString(),
    autoRenew: false,
    classesUsed: 0,
    classesPerTerm: null,
    paidAt: new Date().toISOString(),
    collectedBy: user.fullName,
  });

  if (!subResult.success || !subResult.subscriptionId) {
    return { success: false, error: subResult.error ?? "Failed to create drop-in subscription" };
  }

  return qrWalkInCheckInAction(studentId, classId, subResult.subscriptionId);
}
