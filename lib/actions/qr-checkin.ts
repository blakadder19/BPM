"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import type { Permission } from "@/lib/domain/permissions";
import { getStudentRepo, getSubscriptionRepo, getTermRepo, getProductRepo, getSpecialEventRepo } from "@/lib/repositories";
import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getInstances } from "@/lib/services/schedule-store";
import { isValidStudentQrToken } from "@/lib/domain/checkin-token";
import { getTodayStr, isClassEnded } from "@/lib/domain/datetime";
import { toVatSnapshotFields, EMPTY_VAT_SNAPSHOT } from "@/lib/domain/vat";
import { ensureOperationalDataHydrated, invalidateHydration } from "@/lib/supabase/hydrate-operational";
import { saveBookingToDB, saveAttendanceToDB } from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";
import { getCheckInEligibility, isCheckableStatus } from "@/lib/domain/checkin-rules";
import { isEntitlementValidForClass, diagnoseNoEntitlement, type ClassContext } from "@/lib/domain/entitlement-rules";
import {
  PAYMENT_NOT_CONFIRMED,
  bookingHoldsCredit,
  classNeedsEntitlement,
  paymentAllowsCheckIn,
  withBookedCreditReturned,
} from "@/lib/domain/checkin-entitlement";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { resolveAccessRuleForSubscription } from "@/lib/domain/subscription-snapshot";
import { buildSnapshotFromProduct } from "@/lib/services/subscription-snapshot-service";
import {
  priceProductForStudent,
  buildAuditDiscountMetadata,
  releaseDiscountClaim,
  attachClaimRelations,
} from "@/lib/services/pricing-service";
import { createSubscription, updateSubscription } from "@/lib/services/subscription-service";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import type { AuthUser } from "@/lib/auth";
import type { CheckInMethod, DanceRole } from "@/types/domain";
import type { MockBookableClass, MockSubscription } from "@/lib/mock-data";
import type { StoredBooking } from "@/lib/services/booking-service";

function qrPerformer(user: AuthUser) {
  return { userId: user.id, email: user.email, name: user.fullName };
}

/**
 * Permission-aware auth guard for QR/check-in actions.
 *
 * Replaces the previous inline `user.role !== "admin" && user.role !== "teacher"`
 * checks with the new permission system so a Front Desk role gets only
 * the operations the Super Admin enabled (typical: scan + manual_checkin
 * + mark_paid_reception) without inheriting unrelated admin powers.
 *
 * Returns a discriminated union the call sites can forward verbatim.
 */
async function requireQrPermission(
  perm: Permission,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const guard = await requirePermissionForAction(perm);
  if (!guard.ok) return { ok: false, error: guard.error };
  return { ok: true, user: guard.access.user };
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

/** Access rules from the live catalog (fallback for subscriptions without a snapshot). */
async function liveAccessRules() {
  const allProducts = await getProductRepo().getAll();
  return buildDynamicAccessRulesMap(
    allProducts.map((p) => ({
      id: p.id,
      name: p.name,
      productType: p.productType,
      allowedLevels: p.allowedLevels ?? null,
      allowedStyleIds: p.allowedStyleIds ?? null,
      styleAccessMode: p.styleAccessMode ?? null,
      styleAccessPickCount: p.styleAccessPickCount ?? null,
      allowedClassTypes: p.allowedClassTypes ?? null,
    })),
    getDanceStyles(),
  );
}

function classContextOf(cls: MockBookableClass): ClassContext {
  return {
    classType: cls.classType,
    styleName: cls.styleName ?? null,
    styleId: cls.styleId ?? null,
    level: cls.level ?? null,
    date: cls.date,
  };
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
 * Core student QR lookup — no auth check. Not exported (it returns student
 * contact details and entitlements); callers use `lookupStudentByQrAction`.
 */
async function lookupStudentByQr(token: string): Promise<QrLookupResult> {
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

  const accessRulesMap = await liveAccessRules();

  // Phase 1: prefer the frozen-at-purchase snapshot when present so
  // post-sale admin edits to the live product cannot unlock or revoke
  // entitlement at check-in. Falls back to the live rule for legacy subs.
  const passForClass = (cls: MockBookableClass) =>
    studentSubs.find(
      (sub) =>
        sub.status === "active" &&
        isEntitlementValidForClass(sub, classContextOf(cls), allTerms, resolveAccessRuleForSubscription(sub, accessRulesMap)),
    ) ?? null;

  const todayBookings: QrStudentBooking[] = studentBookings.map((b) => {
    const cls = todayInstances.get(b.bookableClassId)!;
    const attRecord = attSvc.getRecord(b.bookableClassId, b.studentId);
    const isCheckedIn = b.status === "checked_in" || attRecord?.status === "present" || attRecord?.status === "late";
    let sub = b.subscriptionId ? subMap.get(b.subscriptionId) : undefined;
    let canCheckIn = isCheckableStatus(b.status);

    let blockedReason: string | null = null;
    if (!isCheckedIn && !canCheckIn) {
      if (b.status === "cancelled" || b.status === "late_cancelled") {
        blockedReason = "Booking was cancelled — cannot check in.";
      } else if (b.status === "missed") {
        blockedReason = "Booking was marked as missed.";
      } else {
        blockedReason = `Booking status "${b.status}" does not allow check-in.`;
      }
    } else if (!isCheckedIn && !b.subscriptionId && classNeedsEntitlement(cls.classType)) {
      const pending = passForClass(cls);
      if (pending?.paymentStatus === "pending") {
        // Offered so "Mark as paid and check in" attaches it to the booking.
        sub = pending;
      } else {
        canCheckIn = false;
        blockedReason = NO_PASS_ON_BOOKING;
      }
    } else if (!isCheckedIn && sub && sub.paymentStatus !== "pending" && !paymentAllowsCheckIn(sub.paymentStatus)) {
      canCheckIn = false;
      blockedReason = PAYMENT_NOT_CONFIRMED;
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

  const todayClasses: QrTodayClass[] = [];
  const bookedClassIds = new Set(studentBookings.map((b) => b.bookableClassId));
  for (const [classId, cls] of todayInstances) {
    if (bookedClassIds.has(classId)) continue;
    if (cls.status === "cancelled") continue;

    const matchedSub = passForClass(cls);

    let blockedReason: string | null = null;
    if (!matchedSub) {
      // Include ALL subs (not just active) so diagnoseNoEntitlement can
      // mention scheduled future memberships and expired products alike.
      blockedReason = diagnoseNoEntitlement(studentSubs, classContextOf(cls), accessRulesMap);
    } else if (matchedSub.paymentStatus === "pending") {
      blockedReason = `Payment pending for ${matchedSub.productName} — confirm payment to check in.`;
    } else if (!paymentAllowsCheckIn(matchedSub.paymentStatus)) {
      blockedReason = PAYMENT_NOT_CONFIRMED;
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
  const guard = await requireQrPermission("checkin:scan");
  if (!guard.ok) return { success: false, error: guard.error };

  return lookupStudentByQr(token);
}

/**
 * Refresh a student lookup by student id (used by the global scan overlay,
 * which receives a resolved result but not the original QR token).
 */
export async function lookupStudentByIdAction(studentId: string): Promise<QrLookupResult> {
  const guard = await requireQrPermission("checkin:scan");
  if (!guard.ok) return { success: false, error: guard.error };

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
  const guard = await requireQrPermission("checkin:manual_checkin");
  if (!guard.ok) return { success: false, error: guard.error };
  const user = guard.user;

  await ensureOperationalDataHydrated();

  const check = await checkBookingCheckIn(bookingId);
  if (!check.ok) return { success: false, error: check.error };
  const { booking, cls } = check;

  // The booking's credit was taken when it was booked; check-in takes none.
  const svc = getBookingService();
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

  revalidateQrAdminSurfaces();

  return { success: true, classTitle: cls.title };
}

type Denied = { ok: false; error: string };

const NO_PASS_ON_BOOKING = "This booking has no pass attached, so it cannot be checked in.";
const NOT_AWAITING_PAYMENT = "This pass is not awaiting payment.";

/** A scheduled class staff can check students into right now. */
function openClassForCheckIn(classId: string): { ok: true; cls: MockBookableClass } | Denied {
  const cls = getInstances().find((c) => c.id === classId);
  if (!cls) return { ok: false, error: "Class not found" };
  if (cls.date !== getTodayStr()) return { ok: false, error: "Class is not today" };
  if (cls.status === "cancelled") return { ok: false, error: "Class is cancelled" };
  if (isClassEnded(cls.date, cls.endTime)) {
    return { ok: false, error: "This class has ended. Check-in is only for classes that have not ended." };
  }
  return { ok: true, cls };
}

type EntitlementFields = Pick<
  MockSubscription,
  | "productId" | "productName" | "productSnapshot" | "productType" | "status" | "validFrom" | "validUntil"
  | "remainingCredits" | "totalCredits" | "classesUsed" | "classesPerTerm"
  | "selectedStyleId" | "selectedStyleName" | "selectedStyleIds" | "selectedStyleNames"
>;

/**
 * Same rule the QR lookup uses to offer a pass for a class: status,
 * validity window, remaining usage, class type, style and level, from the
 * frozen product snapshot when present.
 */
async function entitlementDenial(sub: EntitlementFields, cls: MockBookableClass): Promise<string | null> {
  const [rules, terms] = await Promise.all([liveAccessRules(), getTermRepo().getAll()]);
  const ok = isEntitlementValidForClass(
    // Only the fields picked above are read.
    sub as MockSubscription,
    classContextOf(cls),
    terms,
    resolveAccessRuleForSubscription(sub, rules),
  );
  return ok ? null : `${sub.productName} is not valid for ${cls.title}.`;
}

/** A pass's payment state allows this use: confirmed for check-in, pending when the caller is about to collect it. */
function paymentDenial(sub: MockSubscription, paying: boolean): string | null {
  if (paying) return sub.paymentStatus === "pending" ? null : NOT_AWAITING_PAYMENT;
  return paymentAllowsCheckIn(sub.paymentStatus) ? null : PAYMENT_NOT_CONFIRMED;
}

/**
 * Checks shared by every walk-in path; callers run it before writing
 * anything. `subscriptionId` null means the caller is about to create the
 * pass itself (drop-in sale) and checks it separately. `paying`: the
 * caller is about to mark that pending pass paid. Expects operational
 * data to be hydrated.
 */
async function checkWalkIn(
  studentId: string,
  classId: string,
  subscriptionId: string | null,
  { paying = false }: { paying?: boolean } = {},
) {
  const open = openClassForCheckIn(classId);
  if (!open.ok) return open;
  const { cls } = open;

  const student = (await getStudentRepo().getAll()).find((s) => s.id === studentId);
  if (!student) return { ok: false as const, error: "Student not found" };

  const existing = getBookingService().bookings.find(
    (b) => b.studentId === studentId && b.bookableClassId === classId && b.status !== "cancelled" && b.status !== "late_cancelled"
  );
  if (existing) {
    return { ok: false as const, error: "Student already has a booking for this class. Use the booking check-in instead." };
  }

  if (subscriptionId !== null) {
    const sub = subscriptionId ? await getSubscriptionRepo().getById(subscriptionId) : null;
    if (!sub || sub.studentId !== studentId) {
      return { ok: false as const, error: "That pass does not belong to this student." };
    }
    const denial = (await entitlementDenial(sub, cls)) ?? paymentDenial(sub, paying);
    if (denial) return { ok: false as const, error: denial };
  }

  return { ok: true as const, cls, student };
}

type BookingCheckIn =
  | {
      ok: true;
      booking: StoredBooking;
      cls: MockBookableClass;
      /** The paid pass to attach to a booking that has none; it gives one credit. */
      attach: MockSubscription | null;
    }
  | Denied;

/**
 * Everything a staff booking check-in needs, checked before any write:
 * the booking can be checked in now, and its pass is the student's, covers
 * the class (counting this booking's own credit as still available) and is
 * paid for. A booking without a pass is only checked in on a class that
 * needs none.
 *
 * `paying`: the caller is about to mark that pending pass paid. It must be
 * the booking's pass, or, for a booking without one on a class that needs
 * one, a pass of the student's that covers the class; that pass is
 * returned as `attach`. Expects operational data to be hydrated.
 */
async function checkBookingCheckIn(bookingId: string, paying?: { subscriptionId: string }): Promise<BookingCheckIn> {
  const booking = getBookingService().bookings.find((b) => b.id === bookingId);
  if (!booking) return { ok: false, error: "Booking not found" };

  const open = openClassForCheckIn(booking.bookableClassId);
  if (!open.ok) return open;
  const { cls } = open;

  const eligibility = getCheckInEligibility(booking.status, cls.date, cls.startTime, "staff");
  if (!eligibility.eligible) return { ok: false, error: eligibility.reason ?? "Booking cannot be checked in" };

  const needsPass = classNeedsEntitlement(cls.classType);
  const subscriptionId = paying ? paying.subscriptionId : booking.subscriptionId;
  if (!subscriptionId) {
    return needsPass ? { ok: false, error: NO_PASS_ON_BOOKING } : { ok: true, booking, cls, attach: null };
  }

  const sub = await getSubscriptionRepo().getById(subscriptionId);
  if (!sub || sub.studentId !== booking.studentId) {
    return { ok: false, error: "That pass does not belong to the booked student." };
  }
  if (booking.subscriptionId && booking.subscriptionId !== sub.id) {
    return { ok: false, error: "That pass is not the one this booking uses." };
  }
  const attach = !booking.subscriptionId;
  if (attach && !needsPass) {
    return { ok: false, error: "This class does not need a pass. Check the booking in without taking a payment." };
  }

  // A birthday booking uses the member's free class, not the pass's usage.
  if (booking.source !== "birthday") {
    const denial = await entitlementDenial(bookingHoldsCredit(booking) ? withBookedCreditReturned(sub) : sub, cls);
    if (denial) return { ok: false, error: denial };
  }
  const denial = paymentDenial(sub, !!paying);
  if (denial) return { ok: false, error: denial };

  return { ok: true, booking, cls, attach: attach ? sub : null };
}

export async function qrWalkInCheckInAction(
  studentId: string,
  classId: string,
  subscriptionId: string,
): Promise<QrCheckInResult> {
  const guard = await requireQrPermission("checkin:manual_checkin");
  if (!guard.ok) return { success: false, error: guard.error };
  const user = guard.user;

  await ensureOperationalDataHydrated();

  const check = await checkWalkIn(studentId, classId, subscriptionId);
  if (!check.ok) return { success: false, error: check.error };
  const { cls, student } = check;
  const svc = getBookingService();

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
  const guard = await requireQrPermission("payments:mark_paid_reception");
  if (!guard.ok) return { success: false, error: guard.error };
  const user = guard.user;
  const checkInGuard = await requireQrPermission("checkin:manual_checkin");
  if (!checkInGuard.ok) return { success: false, error: checkInGuard.error };

  await ensureOperationalDataHydrated();

  const check = await checkBookingCheckIn(bookingId, { subscriptionId });
  if (!check.ok) return { success: false, error: check.error };

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

  if (check.attach) {
    // The booking now holds this pass's credit, exactly as if it had been
    // booked with it, so cancelling it later refunds that credit.
    const { booking } = check;
    booking.subscriptionId = check.attach.id;
    booking.subscriptionName = check.attach.productName;
    await consumeCredit(check.attach.id);
    if (isRealUser(booking.studentId)) await saveBookingToDB(booking);
  }

  return qrCheckInBookingAction(bookingId);
}

export async function qrMarkPaidAndWalkInAction(
  studentId: string,
  classId: string,
  subscriptionId: string,
  paymentMethod: "cash" | "revolut" = "cash",
): Promise<QrCheckInResult> {
  const guard = await requireQrPermission("payments:mark_paid_reception");
  if (!guard.ok) return { success: false, error: guard.error };
  const user = guard.user;
  const checkInGuard = await requireQrPermission("checkin:manual_checkin");
  if (!checkInGuard.ok) return { success: false, error: checkInGuard.error };

  await ensureOperationalDataHydrated();

  const check = await checkWalkIn(studentId, classId, subscriptionId, { paying: true });
  if (!check.ok) return { success: false, error: check.error };

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
  const guard = await requireQrPermission("payments:mark_paid_reception");
  if (!guard.ok) return { success: false, error: guard.error };
  const user = guard.user;

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
  const guard = await requireQrPermission("payments:mark_paid_reception");
  if (!guard.ok) return { success: false, error: guard.error };
  const user = guard.user;

  const checkInGuard = await requireQrPermission("checkin:manual_checkin");
  if (!checkInGuard.ok) return { success: false, error: checkInGuard.error };

  await ensureOperationalDataHydrated();

  const check = await checkWalkIn(studentId, classId, null);
  if (!check.ok) return { success: false, error: check.error };

  const allProducts = await getProductRepo().getAll();
  const dropInProduct = allProducts.find((p) => p.productType === "drop_in" && p.isActive);
  if (!dropInProduct) {
    return { success: false, error: "No active drop-in product found. Create one in Settings first." };
  }

  const today = getTodayStr();
  // Phase 1: snapshot the drop-in product/rule state at the moment of sale
  // so a later admin edit (e.g. narrowing allowedStyleIds) cannot retroactively
  // invalidate this drop-in at check-in time.
  const productSnapshot = await buildSnapshotFromProduct(dropInProduct);
  const entitlement = {
    productId: dropInProduct.id,
    productName: dropInProduct.name,
    productType: "drop_in" as const,
    status: "active" as const,
    totalCredits: dropInProduct.totalCredits ?? 1,
    remainingCredits: dropInProduct.totalCredits ?? 1,
    validFrom: today,
    validUntil: null,
    classesUsed: 0,
    classesPerTerm: null,
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    productSnapshot,
  };
  // The walk-in check runs again on the stored row after the sale; checking
  // the same fields here means a drop-in that cannot be used is never sold.
  const fitDenial = await entitlementDenial(entitlement, check.cls);
  if (fitDenial) return { success: false, error: fitDenial };

  // Phase 4 hardening: commit-mode pricing — the QR drop-in sale is
  // effectively the moment of charge, so any first-time-purchase rule
  // must be atomically claimed here.
  const pricing = await priceProductForStudent({
    studentId,
    product: { id: dropInProduct.id, productType: "drop_in", priceCents: dropInProduct.priceCents },
    // Phase 15 — QR drop-in is always collected in cash at the desk,
    // so it follows the manual-payment VAT rule (off by default).
    vatChannel: "manual",
    commit: { source: "qr_dropin" },
  });
  const subResult = await createSubscription({
    studentId,
    ...entitlement,
    notes: `Sold via QR check-in by ${user.fullName}`,
    termId: null,
    paymentMethod: "cash" as const,
    paymentStatus: "paid" as const,
    // assigned_by is a UUID FK to users(id) — must be the auth user
    // id, not a display name. Finance BY column resolves the id back
    // to a human label via identityMap.
    assignedBy: user.id,
    assignedAt: new Date().toISOString(),
    autoRenew: false,
    priceCentsAtPurchase: pricing.vat.totalIncVatCents,
    currencyAtPurchase: "EUR",
    paidAt: new Date().toISOString(),
    paymentNotes: `Collected by ${user.fullName} via QR check-in`,
    collectedBy: user.fullName,
    originalPriceCents: pricing.basePriceCents,
    discountAmountCents: pricing.totalDiscountCents,
    appliedDiscount: pricing.snapshot,
    ...(pricing.vat.vatApplied
      ? toVatSnapshotFields(pricing.vat)
      : EMPTY_VAT_SNAPSHOT),
  });

  if (!subResult.success || !subResult.subscriptionId) {
    if (pricing.claim) {
      // Atomic claim was granted but the subscription insert failed —
      // release so the student can retry without losing first-time.
      await releaseDiscountClaim(
        pricing.claim.id,
        "qr_dropin_subscription_create_failed",
      );
    }
    return { success: false, error: subResult.error ?? "Failed to create drop-in subscription" };
  }

  logFinanceEvent({
    entityType: "subscription",
    entityId: subResult.subscriptionId,
    action: "created",
    performer: qrPerformer(user),
    detail: pricing.snapshot
      ? `Drop-in sold via QR — ${dropInProduct.name} with ${pricing.appliedDiscounts.length} discount(s)`
      : `Drop-in sold via QR — ${dropInProduct.name}`,
    newValue: "paid",
    metadata: buildAuditDiscountMetadata(pricing),
  });

  if (pricing.claim) {
    await attachClaimRelations(pricing.claim.id, {
      relatedSubscriptionId: subResult.subscriptionId,
    });
  }

  const checkIn = await qrWalkInCheckInAction(studentId, classId, subResult.subscriptionId);
  if (!checkIn.success) {
    return {
      success: false,
      error: `The drop-in was sold and stays on the student's account, but check-in failed: ${checkIn.error ?? "unknown error"}`,
    };
  }
  return checkIn;
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
  const guard = await requireQrPermission("checkin:scan");
  if (!guard.ok) return { success: false, error: guard.error };

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
