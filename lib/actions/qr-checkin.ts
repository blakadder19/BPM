"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getStudentRepo, getSubscriptionRepo, getTermRepo, getProductRepo, getSpecialEventRepo } from "@/lib/repositories";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getInstances } from "@/lib/services/schedule-store";
import { isValidStudentQrToken } from "@/lib/domain/checkin-token";
import { getTodayStr, isClassEnded } from "@/lib/domain/datetime";
import { ensureOperationalDataHydrated, invalidateHydration } from "@/lib/supabase/hydrate-operational";
import { saveBookingToDB, saveAttendanceToDB } from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";
import { isCheckableStatus } from "@/lib/domain/checkin-rules";
import { isEntitlementValidForClass, diagnoseNoEntitlement } from "@/lib/domain/entitlement-rules";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { createSubscription, updateSubscription } from "@/lib/services/subscription-service";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import type { AuthUser } from "@/lib/auth";
import type { CheckInMethod, DanceRole } from "@/types/domain";

function qrPerformer(user: AuthUser) {
  return { userId: user.id, email: user.email, name: user.fullName };
}

/**
 * Single place to refresh every admin surface that can be affected by a QR
 * operation. Includes classes/bookable and finance because:
 *  - Check-in mutates attendance + booking counts rendered in the classes list
 *  - Sell-drop-in + mark-paid create/mutate subscriptions and finance entries
 * Also calls invalidateHydration() so the next render skips the 2s throttle
 * and re-reads operational data from Supabase.
 */
function revalidateQrAdminSurfaces(): void {
  invalidateHydration();
  revalidatePath("/attendance");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/students");
  revalidatePath("/classes/bookable");
  revalidatePath("/classes");
  revalidatePath("/finance");
}

async function consumeCredit(subscriptionId: string): Promise<void> {
  if (!subscriptionId) return;
  const sub = await getSubscriptionRepo().getById(subscriptionId);
  if (!sub) return;
  if (sub.productType === "membership" && sub.classesPerTerm !== null) {
    await updateSubscription(sub.id, { classesUsed: sub.classesUsed + 1 });
  } else if (sub.remainingCredits !== null) {
    const next = Math.max(0, sub.remainingCredits - 1);
    await updateSubscription(sub.id, {
      remainingCredits: next,
      ...(next === 0 ? { status: "exhausted" as const } : {}),
    });
  }
}

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
  /** Human-readable reason when canCheckIn is false and isCheckedIn is false. */
  blockedReason: string | null;
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
  /**
   * When `hasEntitlement` is false, a precise explanation from the domain
   * entitlement rules (future term / wrong style / no plan / exhausted / etc).
   * When `hasEntitlement` is true but the entitlement cannot be used right now
   * (e.g. already checked in, class cancelled), this still carries the reason.
   */
  blockedReason: string | null;
}

/** @deprecated kept temporarily — use QrTodayClass instead */
export type QrCompatibleClass = QrTodayClass;

export interface QrEventPurchase {
  eventTitle: string;
  eventId: string;
  productName: string;
  productType: string;
  paymentStatus: string;
  purchasedAt: string;
}

export type QrEntitlementGroup = "active" | "pending_payment" | "scheduled" | "ended";

export interface QrGroupedEntitlement extends QrEntitlementDetail {
  effectiveGroup: QrEntitlementGroup;
}

export interface QrLookupResult {
  success: boolean;
  error?: string;
  student?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  };
  todayBookings?: QrStudentBooking[];
  todayClasses?: QrTodayClass[];
  /** @deprecated use todayClasses */
  compatibleClasses?: QrTodayClass[];
  entitlements?: QrEntitlementDetail[];
  allEntitlements?: QrGroupedEntitlement[];
  recentExpiredEntitlement?: QrEntitlementDetail | null;
  paymentPending?: boolean;
  hasActiveEntitlement?: boolean;
  eventPurchases?: QrEventPurchase[];
}

/**
 * Core student QR lookup — no auth check, reusable from paired-scan.
 * Exported for use by `processPairedScanAction`; UI-facing callers
 * should use `lookupStudentByQrAction` which wraps this with auth.
 */
export async function lookupStudentByQr(token: string): Promise<QrLookupResult> {
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
    const canCheckIn = isCheckableStatus(b.status);

    let blockedReason: string | null = null;
    if (!isCheckedIn && !canCheckIn) {
      if (b.status === "cancelled" || b.status === "late_cancelled") {
        blockedReason = "Booking was cancelled — cannot check in.";
      } else if (b.status === "no_show") {
        blockedReason = "Booking was marked as no-show.";
      } else {
        blockedReason = `Booking status "${b.status}" does not allow check-in.`;
      }
    }

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
      canCheckIn,
      blockedReason,
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

  // Full entitlement picture for admin — ALL subscriptions grouped by effective status
  const allEntitlements = studentSubs
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    .map((s) => {
      const detail = buildEntitlementDetail(s);
      let effectiveGroup: "active" | "pending_payment" | "scheduled" | "ended";
      if (s.status === "active" && s.validFrom <= today && (!s.validUntil || s.validUntil >= today)) {
        effectiveGroup = s.paymentStatus === "pending" ? "pending_payment" : "active";
      } else if (s.status === "active" && s.validFrom > today) {
        effectiveGroup = "scheduled";
      } else {
        effectiveGroup = "ended";
      }
      return { ...detail, effectiveGroup };
    });

  const allProducts = await getProductRepo().getAll();
  const danceStyles = getDanceStyles();
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

    let blockedReason: string | null = null;
    if (!matchedSub) {
      // Include ALL subs (not just active) so diagnoseNoEntitlement can
      // mention scheduled future memberships and expired products alike.
      blockedReason = diagnoseNoEntitlement(studentSubs, classCtx, accessRulesMap);
    } else if (matchedSub.paymentStatus === "pending") {
      blockedReason = `Payment pending for ${matchedSub.productName} — confirm payment to check in.`;
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
      blockedReason,
    });
  }

  let eventPurchases: QrEventPurchase[] = [];
  try {
    const eventRepo = getSpecialEventRepo();
    const rawPurchases = await eventRepo.getPurchasesByStudent(student.id);
    const relevantPurchases = rawPurchases.filter((p) => p.paymentStatus !== "refunded");

    if (relevantPurchases.length > 0) {
      const eventIds = [...new Set(relevantPurchases.map((p) => p.eventId))];
      const events = await Promise.all(eventIds.map((id) => eventRepo.getEventById(id)));
      const eventMap = new Map(events.filter(Boolean).map((e) => [e!.id, e!]));
      const productIds = [...new Set(relevantPurchases.map((p) => p.eventProductId))];
      const productsByEvent = await Promise.all(eventIds.map((id) => eventRepo.getProductsByEvent(id)));
      const productMap = new Map(productsByEvent.flat().filter((p) => productIds.includes(p.id)).map((p) => [p.id, p]));

      eventPurchases = relevantPurchases.map((p) => ({
        eventTitle: eventMap.get(p.eventId)?.title ?? "Unknown event",
        eventId: p.eventId,
        productName: productMap.get(p.eventProductId)?.name ?? "Unknown product",
        productType: productMap.get(p.eventProductId)?.productType ?? "other",
        paymentStatus: p.paymentStatus,
        purchasedAt: p.purchasedAt,
      }));
    }
  } catch {
    // Non-critical — don't block QR scan if event repo fails
  }

  return {
    success: true,
    student: {
      id: student.id,
      name: student.fullName,
      email: student.email,
      phone: student.phone ?? null,
    },
    todayBookings,
    todayClasses,
    compatibleClasses: todayClasses,
    entitlements: activeEntitlements,
    allEntitlements,
    recentExpiredEntitlement,
    paymentPending,
    hasActiveEntitlement,
    eventPurchases: eventPurchases.length > 0 ? eventPurchases : undefined,
  };
}

export async function lookupStudentByQrAction(token: string): Promise<QrLookupResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  return lookupStudentByQr(token);
}

/**
 * Refresh a student lookup by student id (used by the global scan overlay,
 * which receives a resolved result but not the original QR token).
 */
export async function lookupStudentByIdAction(studentId: string): Promise<QrLookupResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();
  const students = await getStudentRepo().getAll();
  const student = students.find((s) => s.id === studentId);
  if (!student?.qrToken) {
    return { success: false, error: "Student not found" };
  }
  return lookupStudentByQr(student.qrToken);
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

  if (booking.subscriptionId) {
    await consumeCredit(booking.subscriptionId);
  }

  if (isRealUser(booking.studentId)) {
    const checkedIn = svc.bookings.find((b) => b.id === bookingId);
    if (checkedIn) await saveBookingToDB(checkedIn);
    const attRecord = attSvc.getRecord(booking.bookableClassId, booking.studentId);
    if (attRecord) await saveAttendanceToDB(attRecord);
  }

  revalidateQrAdminSurfaces();

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

  if (subscriptionId) {
    await consumeCredit(subscriptionId);
  }

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

  revalidateQrAdminSurfaces();

  return { success: true, classTitle: cls.title };
}

export async function qrMarkPaidAndCheckInAction(
  bookingId: string,
  subscriptionId: string,
  paymentMethod: "cash" | "revolut" = "cash",
): Promise<QrCheckInResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  const prevSub = await getSubscriptionRepo().getById(subscriptionId);

  await updateSubscription(subscriptionId, {
    paymentStatus: "paid",
    paymentMethod,
    paidAt: new Date().toISOString(),
    paymentNotes: `Collected by ${user.fullName} via QR check-in`,
    collectedBy: user.fullName,
  });

  logFinanceEvent({
    entityType: "subscription",
    entityId: subscriptionId,
    action: "marked_paid",
    performer: qrPerformer(user),
    detail: `QR check-in — ${paymentMethod}`,
    previousValue: prevSub?.paymentStatus ?? null,
    newValue: "paid",
  });

  try {
    const sub = await getSubscriptionRepo().getById(subscriptionId);
    if (sub) {
      const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
      await dismissNotificationsForSubscription(sub.studentId, subscriptionId);
    }
  } catch { /* best-effort */ }

  return qrCheckInBookingAction(bookingId);
}

export async function qrMarkPaidAndWalkInAction(
  studentId: string,
  classId: string,
  subscriptionId: string,
  paymentMethod: "cash" | "revolut" = "cash",
): Promise<QrCheckInResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  const prevSub = await getSubscriptionRepo().getById(subscriptionId);

  await updateSubscription(subscriptionId, {
    paymentStatus: "paid",
    paymentMethod,
    paidAt: new Date().toISOString(),
    paymentNotes: `Collected by ${user.fullName} via QR check-in`,
    collectedBy: user.fullName,
  });

  logFinanceEvent({
    entityType: "subscription",
    entityId: subscriptionId,
    action: "marked_paid",
    performer: qrPerformer(user),
    detail: `QR walk-in — ${paymentMethod}`,
    previousValue: prevSub?.paymentStatus ?? null,
    newValue: "paid",
  });

  try {
    const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
    await dismissNotificationsForSubscription(studentId, subscriptionId);
  } catch { /* best-effort */ }

  return qrWalkInCheckInAction(studentId, classId, subscriptionId);
}

export async function qrMarkSubscriptionPaidAction(
  subscriptionId: string,
  paymentMethod: "cash" | "revolut" = "cash",
): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  await ensureOperationalDataHydrated();

  const prevSub = await getSubscriptionRepo().getById(subscriptionId);

  const result = await updateSubscription(subscriptionId, {
    paymentStatus: "paid",
    paymentMethod,
    paidAt: new Date().toISOString(),
    paymentNotes: `Collected by ${user.fullName} via QR check-in`,
    collectedBy: user.fullName,
  });

  if (result.success) {
    logFinanceEvent({
      entityType: "subscription",
      entityId: subscriptionId,
      action: "marked_paid",
      performer: qrPerformer(user),
      detail: `QR mark paid — ${paymentMethod}`,
      previousValue: prevSub?.paymentStatus ?? null,
      newValue: "paid",
    });
    try {
      const sub = await getSubscriptionRepo().getById(subscriptionId);
      if (sub) {
        const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
        await dismissNotificationsForSubscription(sub.studentId, subscriptionId);
      }
    } catch { /* best-effort */ }
    revalidateQrAdminSurfaces();
  }

  return result;
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
    notes: `Sold via QR check-in by ${user.fullName}`,
    termId: null,
    paymentMethod: "cash" as const,
    paymentStatus: "paid" as const,
    assignedBy: user.fullName,
    assignedAt: new Date().toISOString(),
    autoRenew: false,
    classesUsed: 0,
    classesPerTerm: null,
    priceCentsAtPurchase: dropInProduct.priceCents,
    currencyAtPurchase: "EUR",
    paidAt: new Date().toISOString(),
    paymentNotes: `Collected by ${user.fullName} via QR check-in`,
    collectedBy: user.fullName,
  });

  if (!subResult.success || !subResult.subscriptionId) {
    return { success: false, error: subResult.error ?? "Failed to create drop-in subscription" };
  }

  logFinanceEvent({
    entityType: "subscription",
    entityId: subResult.subscriptionId,
    action: "created",
    performer: qrPerformer(user),
    detail: `Drop-in sold via QR — ${dropInProduct.name}`,
    newValue: "paid",
  });

  return qrWalkInCheckInAction(studentId, classId, subResult.subscriptionId);
}

// ── Guest purchase QR lookup ──────────────────────────────────

export interface GuestPurchaseQrResult {
  success: boolean;
  error?: string;
  purchase?: {
    id: string;
    guestName: string;
    guestEmail: string;
    guestPhone: string | null;
    eventTitle: string;
    eventId: string;
    productName: string;
    productType: string;
    paymentStatus: string;
    paymentMethod: string;
    purchasedAt: string;
    paidAt: string | null;
    inclusionSummary: string;
  };
}

export async function lookupGuestPurchaseByQrAction(token: string): Promise<GuestPurchaseQrResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  const { isValidGuestPurchaseQrToken } = await import("@/lib/domain/checkin-token");
  if (!token || !isValidGuestPurchaseQrToken(token)) {
    return { success: false, error: "Invalid guest purchase QR code format" };
  }

  const { getSpecialEventRepo } = await import("@/lib/repositories");
  const repo = getSpecialEventRepo();

  const purchase = await repo.getPurchaseByQrToken(token);
  if (!purchase) {
    return { success: false, error: "No purchase found for this QR code" };
  }

  const [event, products] = await Promise.all([
    repo.getEventById(purchase.eventId).catch(() => null),
    repo.getProductsByEvent(purchase.eventId).catch(() => []),
  ]);

  const product = products.find((p) => p.id === purchase.eventProductId);

  let inclusionSummary = "";
  if (product) {
    switch (product.inclusionRule) {
      case "all_sessions": inclusionSummary = "All event sessions"; break;
      case "all_workshops": inclusionSummary = "All workshops"; break;
      case "socials_only": inclusionSummary = "Social sessions only"; break;
      case "selected_sessions": inclusionSummary = "Selected sessions"; break;
    }
  }

  return {
    success: true,
    purchase: {
      id: purchase.id,
      guestName: purchase.guestName ?? "Guest",
      guestEmail: purchase.guestEmail ?? "",
      guestPhone: purchase.guestPhone ?? null,
      eventTitle: event?.title ?? "Unknown event",
      eventId: purchase.eventId,
      productName: product?.name ?? "Unknown product",
      productType: product?.productType ?? "other",
      paymentStatus: purchase.paymentStatus,
      paymentMethod: purchase.paymentMethod,
      purchasedAt: purchase.purchasedAt,
      paidAt: purchase.paidAt ?? null,
      inclusionSummary,
    },
  };
}
