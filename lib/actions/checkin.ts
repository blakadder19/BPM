"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getCheckInEligibility, isCheckableStatus } from "@/lib/domain/checkin-rules";
import { isValidTokenFormat } from "@/lib/domain/checkin-token";
import type { CheckInMethod } from "@/types/domain";
import { isRealUser } from "@/lib/utils/is-real-user";
import { saveBookingToDB, saveAttendanceToDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";

function revalidateAll() {
  revalidatePath("/bookings");
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  revalidatePath("/classes");
}

interface CheckInResult {
  success: boolean;
  studentName?: string;
  classTitle?: string;
  error?: string;
}

/**
 * Student self check-in: the student checks themselves in from My Bookings.
 */
export async function studentSelfCheckInAction(
  bookingId: string
): Promise<CheckInResult> {
  await ensureOperationalDataHydrated();
  if (!bookingId) return { success: false, error: "Missing booking ID" };

  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated as student" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { success: false, error: "Booking not found" };
  if (booking.studentId !== user.id) {
    return { success: false, error: "Not your booking" };
  }

  if (!isCheckableStatus(booking.status)) {
    if (booking.status === "checked_in") {
      return { success: false, error: "Already checked in" };
    }
    return { success: false, error: `Cannot check in a ${booking.status} booking` };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const eligibility = getCheckInEligibility(booking.status, cls.date, cls.startTime, "self");
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason };
  }

  const bookingResult = svc.checkInBooking(bookingId);
  if (bookingResult.type === "error") {
    return { success: false, error: bookingResult.reason };
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
    checkInMethod: "self" as CheckInMethod,
    markedBy: booking.studentName,
  });

  if (isRealUser(booking.studentId)) {
    const checkedIn = svc.bookings.find((b) => b.id === bookingId);
    if (checkedIn) await saveBookingToDB(checkedIn);
    const attRecord = attSvc.getRecord(booking.bookableClassId, booking.studentId);
    if (attRecord) await saveAttendanceToDB(attRecord);
  }

  revalidateAll();
  return { success: true, studentName: booking.studentName, classTitle: cls.title };
}

/**
 * Token/QR-based check-in: validates a token string and checks in the booking.
 * Can be called by staff scanning a QR or manually entering a token.
 */
export async function validateTokenCheckInAction(
  token: string
): Promise<CheckInResult> {
  await ensureOperationalDataHydrated();
  if (!token || !isValidTokenFormat(token)) {
    return { success: false, error: "Invalid check-in token" };
  }

  const svc = getBookingService();
  const booking = svc.findByCheckInToken(token);
  if (!booking) {
    return { success: false, error: "No booking found for this token" };
  }

  if (!isCheckableStatus(booking.status)) {
    if (booking.status === "checked_in") {
      return { success: false, error: "Already checked in" };
    }
    return { success: false, error: `Cannot check in a ${booking.status} booking` };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { success: false, error: "Class not found" };

  const user = await getAuthUser();
  const isStaff = user?.role === "admin" || user?.role === "teacher";
  const method = isStaff ? "staff" : "qr";

  const eligibility = getCheckInEligibility(booking.status, cls.date, cls.startTime, method);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason };
  }

  const bookingResult = svc.checkInBooking(booking.id);
  if (bookingResult.type === "error") {
    return { success: false, error: bookingResult.reason };
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
    markedBy: isStaff ? (user?.fullName ?? "Staff") : "QR Scanner",
  });

  if (isRealUser(booking.studentId)) {
    const checkedIn = svc.bookings.find((b) => b.id === booking.id);
    if (checkedIn) await saveBookingToDB(checkedIn);
    const attRecord = attSvc.getRecord(booking.bookableClassId, booking.studentId);
    if (attRecord) await saveAttendanceToDB(attRecord);
  }

  revalidateAll();
  return { success: true, studentName: booking.studentName, classTitle: cls.title };
}

/**
 * Check self check-in eligibility (read-only, for UI display).
 */
export async function checkSelfCheckInEligibility(
  bookingId: string
): Promise<{ eligible: boolean; reason?: string }> {
  await ensureOperationalDataHydrated();
  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { eligible: false, reason: "Not authenticated" };
  }

  const svc = getBookingService();
  const booking = svc.bookings.find((b) => b.id === bookingId);
  if (!booking) return { eligible: false, reason: "Booking not found" };
  if (booking.studentId !== user.id) {
    return { eligible: false, reason: "Not your booking" };
  }

  const cls = svc.getClass(booking.bookableClassId);
  if (!cls) return { eligible: false, reason: "Class not found" };

  return getCheckInEligibility(booking.status, cls.date, cls.startTime, "self");
}
