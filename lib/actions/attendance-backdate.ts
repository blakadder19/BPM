"use server";

/**
 * Phase 19 — Super Admin backdated attendance correction.
 *
 * The case this exists for: a student attends a class without
 * booking, reception never marks them in, and the next day the class
 * is finished so nothing in BPM can record what actually happened.
 * Three things end up wrong — the attendance count, the class
 * attendee list, and the student's credit balance, which still shows
 * a credit they should have spent.
 *
 * What this does NOT do: it is not "let an admin edit an attendance
 * status". Editing the status alone would fix the display and leave
 * the booking and the credit balance wrong. This creates the whole
 * consistent picture — historical booking, entitlement consumption,
 * attendance record — or it refuses and explains why.
 *
 * Nor is it a way to hand out a free class. When no entitlement
 * covered the class date the correction is REFUSED. Comping a class
 * is a separate, deliberate operation.
 */

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/staff-permissions";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getStudentRepo, getSubscriptionRepo, getProductRepo } from "@/lib/repositories";
import { getInstances } from "@/lib/services/schedule-store";
import { getTerms } from "@/lib/services/term-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getSettings } from "@/lib/services/settings-store";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { getTodayStr } from "@/lib/domain/datetime";
import { getCreditSnapshot } from "@/lib/domain/credit-availability";
import {
  resolveBackdateEligibility,
  checkBackdateClassEligibility,
  describeBackdateRejections,
  classifyExistingBooking,
  shouldVoidPenaltyOnCorrection,
  type BackdateCandidate,
} from "@/lib/domain/backdated-attendance";
import type { StoredBooking } from "@/lib/services/booking-service";
import { consumeEntitlementCredit } from "@/lib/services/entitlement-consumption";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import {
  saveBookingToDB,
  saveAttendanceToDB,
  savePenaltyToDB,
} from "@/lib/supabase/operational-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";
import { generateId } from "@/lib/utils";
import { generateCheckInToken } from "@/lib/domain/checkin-token";

// ── Preview ──────────────────────────────────────────────────

export interface BackdatePreview {
  classTitle: string;
  classDate: string;
  /** Existing booking for this student on this class, in ANY status. */
  existingBooking: {
    id: string;
    status: string;
    source: string;
    subscriptionId: string | null;
    subscriptionName: string | null;
    /**
     * Phase 19.1 — whether that booking's credit is currently spent.
     * A cancelled / late-cancelled / missed booking has had its
     * credit restored and needs one consumed again.
     */
    entitlementState: "consumed" | "restored" | "invalid";
    /** Admin-facing explanation of what the correction will do. */
    note: string;
    /** True when the row will be reinstated rather than duplicated. */
    willReinstate: boolean;
  } | null;
  /** Existing attendance record, if any. */
  existingAttendance: { id: string; status: string } | null;
  /**
   * Entitlements that could have paid for this class ON THE CLASS
   * DATE. Empty when none qualify — `blockedReason` then explains.
   */
  candidates: BackdateCandidate[];
  /** Populated when the correction cannot proceed. */
  blockedReason: string | null;
  /**
   * True when a booking already exists and its credit was already
   * consumed, so this correction only needs to touch attendance.
   */
  attendanceOnly: boolean;
}

/**
 * Resolve everything the admin needs to decide, without mutating
 * anything. Drives the "Add past attendee" dialog.
 */
export async function previewBackdatedAttendanceAction(input: {
  bookableClassId: string;
  studentId: string;
}): Promise<{ success: boolean; error?: string; preview?: BackdatePreview }> {
  await requirePermission("attendance:backdate");
  await ensureOperationalDataHydrated();

  const instance = getInstances().find((i) => i.id === input.bookableClassId);
  if (!instance) return { success: false, error: "Class not found." };

  const classGuard = checkBackdateClassEligibility({
    classDate: instance.date,
    classStatus: instance.status,
    today: getTodayStr(),
  });
  if (!classGuard.ok) return { success: false, error: classGuard.message };

  const bookingSvc = getBookingService();
  const attendanceSvc = getAttendanceService();

  // Phase 19.1 — find ANY booking, not just confirmed/checked_in.
  // Looking only for active ones meant a cancelled or missed booking
  // was invisible here, so the correction created a SECOND booking
  // row for the same student and class.
  const existing = findExistingBooking(
    bookingSvc.bookings,
    input.bookableClassId,
    input.studentId,
  );
  const attendance = attendanceSvc.records.find(
    (r) =>
      r.bookableClassId === input.bookableClassId && r.studentId === input.studentId,
  );
  // Resolved BEFORE classifying: whether a credit is owed depends on
  // the attendance history and the refund rule, not on the booking
  // status alone.
  const classification = existing
    ? classifyExistingBooking(existing.status, {
        previousAttendanceStatus: attendance?.status ?? null,
        refundCreditOnAbsent: getSettings().refundCreditOnAbsent,
      })
    : null;

  const allSubs = await getSubscriptionRepo().getByStudent(input.studentId);
  const allProducts = await getProductRepo().getAll();
  const accessRulesMap = buildDynamicAccessRulesMap(allProducts, getDanceStyles());

  const eligibility = resolveBackdateEligibility({
    subscriptions: allSubs,
    cls: {
      date: instance.date,
      classType: instance.classType,
      styleName: instance.styleName,
      styleId: instance.styleId,
      level: instance.level ?? null,
    },
    accessRulesMap,
    terms: getTerms(),
  });

  // Attendance-only ONLY when the credit is genuinely still spent.
  // A cancelled or late-cancelled booking had its credit given back
  // and needs one consumed again; a `missed` one usually did NOT —
  // see `classifyExistingBooking`.
  const attendanceOnly = classification?.state === "consumed";

  let blockedReason: string | null = null;
  if (!attendanceOnly && eligibility.candidates.length === 0) {
    blockedReason = describeBackdateRejections(eligibility.rejected);
  }

  const bookingSub = existing?.subscriptionId
    ? allSubs.find((s) => s.id === existing.subscriptionId)
    : undefined;

  return {
    success: true,
    preview: {
      classTitle: instance.title,
      classDate: instance.date,
      existingBooking: existing
        ? {
            id: existing.id,
            status: existing.status,
            source: existing.source,
            subscriptionId: existing.subscriptionId ?? null,
            subscriptionName: bookingSub?.productName ?? existing.subscriptionName ?? null,
            entitlementState: classification!.state,
            note: classification!.note,
            willReinstate: classification!.needsReinstatement,
          }
        : null,
      existingAttendance: attendance
        ? { id: attendance.id, status: attendance.status }
        : null,
      candidates: eligibility.candidates,
      blockedReason,
      attendanceOnly,
    },
  };
}

// ── Correction ───────────────────────────────────────────────

export interface BackdateResult {
  success: boolean;
  error?: string;
  bookingId?: string;
  attendanceId?: string;
  creditConsumed?: boolean;
  /** Set when an existing record meant no new work was needed. */
  idempotentNoOp?: boolean;
  previousAttendanceStatus?: string | null;
  /** Phase 19.1 — booking reconciliation outcome. */
  previousBookingStatus?: string | null;
  newBookingStatus?: string | null;
  bookingReinstated?: boolean;
  entitlementWasAlreadyConsumed?: boolean;
  /** How many pending penalties were voided by this correction. */
  penaltiesVoided?: number;
  waitlistResolved?: boolean;
}

export async function backdateAttendanceAction(input: {
  bookableClassId: string;
  studentId: string;
  /** Required unless an existing booking already covers this class. */
  subscriptionId?: string | null;
  reason: string;
}): Promise<BackdateResult> {
  // Permission is enforced HERE, server-side. Hiding the button is
  // not a control.
  const access = await requirePermission("attendance:backdate");
  const admin = access.user;
  await ensureOperationalDataHydrated();

  const reason = (input.reason ?? "").trim();
  if (!reason) {
    return { success: false, error: "A reason is required for a historical correction." };
  }

  const instance = getInstances().find((i) => i.id === input.bookableClassId);
  if (!instance) return { success: false, error: "Class not found." };

  const classGuard = checkBackdateClassEligibility({
    classDate: instance.date,
    classStatus: instance.status,
    today: getTodayStr(),
  });
  if (!classGuard.ok) return { success: false, error: classGuard.message };

  const student = await getStudentRepo().getById(input.studentId);
  if (!student) return { success: false, error: "Student not found." };

  const bookingSvc = getBookingService();
  const attendanceSvc = getAttendanceService();
  const penaltySvc = getPenaltyService();

  // Phase 19.1 — ANY booking, in any status. See
  // `classifyExistingBooking` for why existence alone proves nothing.
  const existingBooking = findExistingBooking(
    bookingSvc.bookings,
    input.bookableClassId,
    input.studentId,
  );
  const previousBookingStatus = existingBooking?.status ?? null;

  const existingAttendance = attendanceSvc.records.find(
    (r) =>
      r.bookableClassId === input.bookableClassId && r.studentId === input.studentId,
  );

  // Resolved BEFORE classifying — see the preview path for why the
  // attendance row and the refund rule are both required inputs.
  const classification = existingBooking
    ? classifyExistingBooking(existingBooking.status, {
        previousAttendanceStatus: existingAttendance?.status ?? null,
        refundCreditOnAbsent: getSettings().refundCreditOnAbsent,
      })
    : null;

  // ── Idempotency ──
  //
  // Re-submitting an identical correction must not create a second
  // booking or take a second credit. The safe signal is: the booking
  // is in a CONSUMED state AND attendance already reads present.
  //
  // Checking attendance alone would be wrong — a `present` record
  // against a cancelled booking is precisely the inconsistent state
  // this correction exists to repair, and short-circuiting on it
  // would leave the credit unspent forever.
  if (
    existingBooking &&
    classification?.state === "consumed" &&
    existingAttendance?.status === "present"
  ) {
    return {
      success: true,
      idempotentNoOp: true,
      bookingId: existingBooking.id,
      attendanceId: existingAttendance.id,
      creditConsumed: false,
      previousAttendanceStatus: "present",
      previousBookingStatus,
      newBookingStatus: existingBooking.status,
      entitlementWasAlreadyConsumed: true,
    };
  }

  let bookingId = existingBooking?.id ?? null;
  let creditConsumed = false;
  let usedSubscriptionId: string | null = existingBooking?.subscriptionId ?? null;
  let balanceBefore: number | null = null;
  let balanceAfter: number | null = null;
  const entitlementWasAlreadyConsumed = classification?.state === "consumed";
  const creditRestoredPreviously = classification?.state === "restored";

  // ── Consume a credit when one is genuinely owed ──
  //
  // Needed when there is no booking at all, OR when the existing
  // booking is in a state whose credit was demonstrably given back.
  // Skipped whenever the credit is still spent — including the common
  // `missed` case, where nothing ever refunded it.
  const needsConsumption = !existingBooking || classification?.state === "restored";

  if (needsConsumption) {
    const allSubs = await getSubscriptionRepo().getByStudent(input.studentId);
    const allProducts = await getProductRepo().getAll();
    const accessRulesMap = buildDynamicAccessRulesMap(allProducts, getDanceStyles());

    const eligibility = resolveBackdateEligibility({
      subscriptions: allSubs,
      cls: {
        date: instance.date,
        classType: instance.classType,
        styleName: instance.styleName,
        styleId: instance.styleId,
        level: instance.level ?? null,
      },
      accessRulesMap,
      terms: getTerms(),
    });

    if (eligibility.candidates.length === 0) {
      // Never silently grant a free class.
      return { success: false, error: describeBackdateRejections(eligibility.rejected) };
    }

    // Selection order:
    //   1. an explicit admin choice;
    //   2. for a reinstatement, the entitlement the booking ORIGINALLY
    //      used — provided it is still historically valid. Reusing it
    //      keeps the correction faithful to what actually happened
    //      rather than quietly moving the charge to another pass;
    //   3. the only candidate, when there is exactly one.
    // Anything else requires an explicit Super Admin decision.
    const originalStillValid =
      existingBooking?.subscriptionId
        ? eligibility.candidates.find(
            (c) => c.subscriptionId === existingBooking.subscriptionId,
          )
        : undefined;

    const chosen =
      (input.subscriptionId
        ? eligibility.candidates.find((c) => c.subscriptionId === input.subscriptionId)
        : undefined) ??
      originalStillValid ??
      (eligibility.candidates.length === 1 ? eligibility.candidates[0] : undefined);

    if (!chosen) {
      // Distinguish the reinstatement case: the original entitlement
      // is gone or no longer valid, so the admin must decide which
      // pass absorbs the charge instead.
      if (existingBooking?.subscriptionId && !originalStillValid) {
        return {
          success: false,
          error: `The membership or pass originally used for this booking is no longer valid for the class date. Select which entitlement should be charged instead.`,
        };
      }
      return {
        success: false,
        error: input.subscriptionId
          ? "The selected membership or pass was not valid for this student on the class date."
          : "Select which membership or pass to use for this correction.",
      };
    }

    const subBefore = allSubs.find((s) => s.id === chosen.subscriptionId);
    balanceBefore = subBefore
      ? getCreditSnapshot(subBefore, instance.date).historicalRemaining
      : null;

    // Consume BEFORE writing the booking. If the deduction fails we
    // abort with nothing created, rather than leaving a booking that
    // was never paid for.
    //
    // `today` is the CLASS DATE: the shared consumption guard would
    // otherwise refuse a pass that has lapsed since, which is exactly
    // the case this whole feature exists to support.
    const consumption = await consumeEntitlementCredit(
      chosen.subscriptionId,
      "attendance_backdate",
      instance.date,
      // The row may since have been flipped to `expired` by the
      // nightly lifecycle job. Its date window still covered the
      // class, which is the question that matters here.
      { allowLapsedStatus: true },
    );
    if (!consumption.consumed) {
      return {
        success: false,
        error:
          consumption.message ??
          "Could not consume a credit from the selected membership or pass.",
      };
    }
    creditConsumed = true;
    usedSubscriptionId = chosen.subscriptionId;

    const subAfter = await getSubscriptionRepo().getById(chosen.subscriptionId);
    balanceAfter = subAfter
      ? getCreditSnapshot(subAfter, instance.date).historicalRemaining
      : null;

    // Either REINSTATE the existing row or create a new one. Never
    // both — a second row for the same student and class would
    // double-count the class attendee list.
    //
    // Capacity and waitlist logic are deliberately bypassed in both
    // branches: the class already happened and the student was
    // physically in the room, so refusing on capacity would mean
    // refusing to record a fact. Class capacity itself is NOT
    // altered; any resulting over-capacity is visible in the audit
    // entry below.
    if (existingBooking) {
      existingBooking.status = classification?.targetStatus ?? "checked_in";
      existingBooking.cancelledAt = null;
      existingBooking.subscriptionId = chosen.subscriptionId;
      existingBooking.subscriptionName = chosen.productName;
      existingBooking.adminNote = `Backdated correction (was ${previousBookingStatus}): ${reason}`;
      if (!existingBooking.checkInToken) {
        existingBooking.checkInToken = generateCheckInToken();
      }
      bookingId = existingBooking.id;

      if (isRealUser(input.studentId)) {
        await saveBookingToDB(existingBooking).catch((e) =>
          console.warn("[attendance-backdate] booking reinstate persist failed:", e),
        );
      }
    } else {
      const booking = {
        id: generateId("b"),
        bookableClassId: input.bookableClassId,
        studentId: input.studentId,
        studentName: student.fullName,
        danceRole: student.preferredRole ?? null,
        status: "checked_in" as const,
        source: "admin_backdated" as const,
        subscriptionId: chosen.subscriptionId,
        subscriptionName: chosen.productName,
        adminNote: `Backdated correction: ${reason}`,
        bookedAt: new Date().toISOString(),
        cancelledAt: null,
        checkInToken: generateCheckInToken(),
      };
      bookingSvc.bookings.push(booking);
      bookingId = booking.id;

      if (isRealUser(input.studentId)) {
        await saveBookingToDB(booking).catch((e) =>
          console.warn("[attendance-backdate] booking persist failed:", e),
        );
      }
    }
  } else if (existingBooking && classification?.targetStatus) {
    // Consumed state but not yet checked in (a plain `confirmed`
    // booking). Move it to checked_in so the booking agrees with the
    // attendance we are about to record. No credit movement.
    existingBooking.status = classification.targetStatus;
    if (isRealUser(input.studentId)) {
      await saveBookingToDB(existingBooking).catch((e) =>
        console.warn("[attendance-backdate] booking status persist failed:", e),
      );
    }
  }

  // ── Waitlist reconciliation ──
  //
  // Waitlist is a separate table from bookings and never consumes an
  // entitlement. If the student was still sitting in `waiting` for a
  // class they demonstrably attended, leaving the entry would show
  // them as actively queuing for a class in the past and could let a
  // later promotion double-book them.
  let waitlistResolved = false;
  const waitingEntry = bookingSvc.waitlist.find(
    (w) =>
      w.bookableClassId === input.bookableClassId &&
      w.studentId === input.studentId &&
      w.status === "waiting",
  );
  if (waitingEntry) {
    waitingEntry.status = "promoted";
    waitingEntry.promotedAt = new Date().toISOString();
    waitlistResolved = true;
  }

  // ── Attendance record ──
  const previousAttendanceStatus = existingAttendance?.status ?? null;

  const outcome = attendanceSvc.markAttendance({
    bookableClassId: input.bookableClassId,
    studentId: input.studentId,
    studentName: student.fullName,
    bookingId,
    classTitle: instance.title,
    date: instance.date,
    status: "present",
    markedBy: admin.fullName ?? admin.email ?? admin.id,
    checkInMethod: "manual",
    notes: `Backdated correction: ${reason}`,
    source: existingBooking ? "booking" : "admin",
    subscriptionId: usedSubscriptionId,
  });

  if (outcome.type === "error") {
    return { success: false, error: outcome.reason };
  }
  const record = outcome.record;

  if (isRealUser(input.studentId)) {
    await saveAttendanceToDB(record).catch((e) =>
      console.warn("[attendance-backdate] attendance persist failed:", e),
    );
  }

  // ── Penalty reconciliation ──
  //
  // Proving attendance invalidates any fee that assumed non-
  // attendance. Three routes produce one:
  //   absent attendance  → no-show penalty
  //   missed booking     → no-show penalty
  //   late_cancelled     → late-cancel penalty
  //
  // All are voided with the same `attendance_corrected` resolution
  // the normal status-change path uses, rather than a second rule.
  // Otherwise the student keeps a charge for a class they attended.
  let penaltyVoided = 0;
  if (shouldVoidPenaltyOnCorrection(previousBookingStatus, previousAttendanceStatus)) {
    const pending = penaltySvc
      .getPenaltiesForStudent(input.studentId)
      .filter(
        (p) =>
          p.bookableClassId === input.bookableClassId &&
          p.resolution === "monetary_pending" &&
          (p.reason === "no_show" || p.reason === "late_cancel"),
      );
    for (const p of pending) {
      penaltySvc.updateResolution(p.id, "attendance_corrected");
      penaltyVoided++;
      if (isRealUser(input.studentId)) {
        const updated = penaltySvc
          .getPenaltiesForStudent(input.studentId)
          .find((x) => x.id === p.id);
        if (updated) {
          await savePenaltyToDB(updated).catch((e) =>
            console.warn("[attendance-backdate] penalty persist failed:", e),
          );
        }
      }
    }
  }

  // ── Audit ──
  //
  // Recorded against the subscription when one was consumed, so the
  // entry sits alongside the other entitlement movements for that
  // row. Falls back to the student when the correction was
  // attendance-only.
  logFinanceEvent({
    entityType: "subscription",
    entityId: usedSubscriptionId ?? `student:${input.studentId}`,
    action: "manual_edit",
    performer: { userId: admin.id, email: admin.email, name: admin.fullName },
    detail: `Backdated attendance correction — reason: ${reason}`,
    previousValue: previousAttendanceStatus,
    newValue: "present",
    metadata: {
      backdatedAttendance: {
        studentId: input.studentId,
        studentName: student.fullName,
        classInstanceId: input.bookableClassId,
        classTitle: instance.title,
        classDate: instance.date,
        bookingId,
        bookingCreated: !existingBooking,
        attendanceId: record.id,
        attendanceCreated: outcome.type === "created",
        subscriptionId: usedSubscriptionId,
        creditConsumed,
        previousCreditBalance: balanceBefore,
        newCreditBalance: balanceAfter,
        previousAttendanceStatus,
        newAttendanceStatus: "present",
        // Phase 19.1 — booking-state reconciliation, so an auditor
        // can see WHY a credit was or was not taken.
        previousBookingStatus,
        newBookingStatus: bookingId
          ? (bookingSvc.bookings.find((b) => b.id === bookingId)?.status ?? null)
          : null,
        bookingReinstated: !!existingBooking && needsConsumption,
        entitlementWasAlreadyConsumed,
        entitlementConsumedByCorrection: creditConsumed,
        creditRestoredPreviously,
        waitlistResolved,
        penaltiesVoided: penaltyVoided,
        // Visible so an admin can spot a class that is now recorded
        // as over its original capacity. Capacity itself is untouched.
        classCapacity: instance.maxCapacity,
        reason,
        adminId: admin.id,
        adminEmail: admin.email,
        performedAt: new Date().toISOString(),
      },
    },
  });

  // ── Revalidate every surface derived from booking/attendance ──
  revalidatePath("/attendance");
  revalidatePath("/bookings");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  revalidatePath("/classes");
  revalidatePath("/penalties");

  return {
    success: true,
    bookingId: bookingId ?? undefined,
    attendanceId: record.id,
    creditConsumed,
    previousAttendanceStatus,
    previousBookingStatus,
    newBookingStatus: bookingId
      ? (bookingSvc.bookings.find((b) => b.id === bookingId)?.status ?? null)
      : null,
    bookingReinstated: !!existingBooking && needsConsumption,
    entitlementWasAlreadyConsumed,
    penaltiesVoided: penaltyVoided,
    waitlistResolved,
  };
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * The most relevant booking for this student and class, in ANY
 * status.
 *
 * Prefers an ACTIVE booking when several exist (legacy data can hold
 * a cancelled row plus a later re-booking), because the active one
 * is the row whose credit is currently spent. Falls back to the most
 * recent non-active row otherwise.
 */
function findExistingBooking(
  bookings: StoredBooking[],
  bookableClassId: string,
  studentId: string,
): StoredBooking | undefined {
  const mine = bookings.filter(
    (b) => b.bookableClassId === bookableClassId && b.studentId === studentId,
  );
  if (mine.length === 0) return undefined;
  const active = mine.find(
    (b) => b.status === "confirmed" || b.status === "checked_in",
  );
  if (active) return active;
  return [...mine].sort((a, b) => b.bookedAt.localeCompare(a.bookedAt))[0];
}
