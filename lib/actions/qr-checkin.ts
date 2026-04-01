"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getStudentRepo, getSubscriptionRepo, getTermRepo } from "@/lib/repositories";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getInstances } from "@/lib/services/schedule-store";
import { isValidStudentQrToken } from "@/lib/domain/checkin-token";
import { getTodayStr, isClassEnded } from "@/lib/domain/datetime";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { saveBookingToDB, saveAttendanceToDB } from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";
import { isCheckableStatus } from "@/lib/domain/checkin-rules";
import type { CheckInMethod } from "@/types/domain";

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

export interface QrLookupResult {
  success: boolean;
  error?: string;
  student?: {
    id: string;
    name: string;
    email: string;
  };
  todayBookings?: QrStudentBooking[];
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
    const TERMINAL = new Set(["expired", "exhausted", "cancelled"]);
    const recent = studentSubs
      .filter((s) => TERMINAL.has(s.status))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    if (recent) {
      recentExpiredEntitlement = buildEntitlementDetail(recent);
    }
  }

  return {
    success: true,
    student: {
      id: student.id,
      name: student.fullName,
      email: student.email,
    },
    todayBookings,
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

  const cls = svc.getClass(booking.bookableClassId);
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
