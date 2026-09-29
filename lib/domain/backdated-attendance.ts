/**
 * Phase 19 — entitlement eligibility AS OF A PAST CLASS DATE.
 *
 * The problem this solves. Robin attended a class on 20 Sep without
 * booking. Reception never marked him in. Zaria reviews attendance on
 * 22 Sep and needs to correct the record — but by then his pass may
 * have expired (Phase 16 made expiry real), so a "is this pass usable
 * right now?" check would wrongly refuse a correction that is
 * factually accurate.
 *
 * The rule: a backdated correction is judged against the CLASS DATE,
 * never against today. A pass that covered 20 Sep is eligible for a
 * 20 Sep correction even if it lapsed on 21 Sep.
 *
 * This is NOT a loophole around Phase 16. Phase 16 stops a lapsed
 * pass funding a NEW booking for a FUTURE class. This module allows a
 * lapsed pass to fund a booking for a class it genuinely covered.
 * Different questions, different answers.
 *
 * Pure: no IO. The caller loads the subscriptions, the class and the
 * access rules; this module decides who is eligible and why not.
 */

import type { MockSubscription } from "@/lib/mock-data";
import type { ProductAccessRule } from "@/config/product-access";
import type { ClassType, ProductType } from "@/types/domain";
import { isEntitlementValidForClass, type ClassContext } from "./entitlement-rules";
import { getCreditSnapshot, type CreditModel } from "./credit-availability";
import { resolveAccessRuleForSubscription } from "./subscription-snapshot";
import type { TermLike } from "./term-rules";

// ── Types ────────────────────────────────────────────────────

export interface BackdateCandidate {
  subscriptionId: string;
  productId: string;
  productName: string;
  productType: ProductType;
  /** How this entitlement counts usage, so the UI can describe it. */
  creditModel: CreditModel;
  /**
   * Units left AS OF THE CLASS DATE. Null for an unlimited
   * entitlement. Note this is the CURRENT stored balance — see the
   * caveat on `asOfBalanceIsCurrent` below.
   */
  remainingAsOf: number | null;
  totalCredits: number | null;
  /**
   * True when the entitlement had no finite cap, so recording the
   * attendance consumes nothing.
   */
  isUnlimited: boolean;
  /** The window the entitlement covered, for display. */
  validFrom: string;
  validUntil: string | null;
  termId: string | null;
  /**
   * True when the entitlement has since lapsed. Surfaced so the admin
   * can see they are using a now-expired pass deliberately.
   */
  hasSinceExpired: boolean;
}

export type BackdateIneligibleReason =
  | "not_valid_on_class_date"
  | "class_not_covered"
  | "no_credit_available"
  | "status_not_bookable";

export interface BackdateRejection {
  subscriptionId: string;
  productName: string;
  reason: BackdateIneligibleReason;
}

export interface BackdateEligibility {
  candidates: BackdateCandidate[];
  /** Why each non-candidate was excluded, for the admin-facing error. */
  rejected: BackdateRejection[];
}

export interface ResolveBackdateEligibilityInput {
  subscriptions: MockSubscription[];
  /** The class being corrected. `date` is the as-of date. */
  cls: {
    date: string;
    classType: ClassType;
    styleName: string | null;
    styleId: string | null;
    level: string | null;
  };
  accessRulesMap: Map<string, ProductAccessRule>;
  terms: TermLike[];
}

// ── Resolver ─────────────────────────────────────────────────

/**
 * Which of the student's entitlements could legitimately have paid
 * for this class on the day it happened.
 *
 * Reuses `isEntitlementValidForClass` — the SAME predicate the normal
 * booking path uses — passing the class date as the "today" argument.
 * That is deliberate: style/level/class-type matching, the validity
 * window and the status gate all behave identically to a live
 * booking, so a backdated correction can never grant access the
 * student could not have had on the day.
 *
 * ── Known limitation, stated rather than hidden ────────────
 * Credit balances are point-in-time counters, not an event log. We
 * therefore check the CURRENT balance rather than reconstructing what
 * it was on the class date. In practice this is the conservative
 * direction: if the student has since spent the credit, the
 * correction is refused rather than silently over-drawing them. An
 * admin can still resolve that case explicitly with a complimentary
 * attendance, which is a separate operation by design.
 */
export function resolveBackdateEligibility(
  input: ResolveBackdateEligibilityInput,
): BackdateEligibility {
  const asOf = input.cls.date;
  const classCtx: ClassContext = {
    classType: input.cls.classType,
    styleName: input.cls.styleName,
    styleId: input.cls.styleId,
    level: input.cls.level,
    date: input.cls.date,
  };

  const candidates: BackdateCandidate[] = [];
  const rejected: BackdateRejection[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const sub of input.subscriptions) {
    const rule = resolveAccessRuleForSubscription(sub, input.accessRulesMap);

    // ── Status, evaluated as-of ──
    //
    // `isEntitlementValidForClass` hard-requires `status === 'active'`,
    // which is right for a live booking but wrong here: the nightly
    // lifecycle job flips a lapsed row to 'expired', and a row that
    // ran out of credits becomes 'exhausted'. Both are consequences
    // of TIME PASSING SINCE the class, not of the entitlement being
    // invalid on the day.
    //
    // Judging Robin's pass by its status today would refuse the very
    // correction this feature exists for. So time-derived statuses
    // are normalised to 'active' for the as-of check, and the date
    // window (also checked as-of) does the real work.
    //
    // Statuses that represent a DELIBERATE withdrawal — paused,
    // cancelled — are never normalised. Those were decisions, not
    // the clock.
    if (!isEligibleStatusForBackdate(sub.status)) {
      rejected.push({
        subscriptionId: sub.id,
        productName: sub.productName,
        reason: "status_not_bookable",
      });
      continue;
    }
    const asOfSub = sub.status === "active" ? sub : { ...sub, status: "active" as const };

    // The single source of truth for "could this have paid for this
    // class", evaluated AS OF the class date.
    const valid = isEntitlementValidForClass(asOfSub, classCtx, input.terms, rule, asOf);

    if (!valid) {
      rejected.push({
        subscriptionId: sub.id,
        productName: sub.productName,
        reason: classifyRejection(sub, classCtx, rule, asOf),
      });
      continue;
    }

    const snap = getCreditSnapshot(asOfSub, asOf);
    candidates.push({
      subscriptionId: sub.id,
      productId: sub.productId,
      productName: sub.productName,
      productType: sub.productType,
      creditModel: snap.model,
      remainingAsOf: snap.historicalRemaining,
      totalCredits: snap.totalCredits,
      isUnlimited: snap.model === "unlimited",
      validFrom: sub.validFrom,
      validUntil: sub.validUntil,
      termId: sub.termId,
      hasSinceExpired: !!sub.validUntil && today > sub.validUntil,
    });
  }

  // Stable, useful ordering for the admin's picker: still-valid
  // entitlements first, then the ones that have since expired, then
  // by remaining balance descending so the least-constrained option
  // is the obvious default.
  candidates.sort((a, b) => {
    if (a.hasSinceExpired !== b.hasSinceExpired) return a.hasSinceExpired ? 1 : -1;
    const ar = a.remainingAsOf ?? Number.MAX_SAFE_INTEGER;
    const br = b.remainingAsOf ?? Number.MAX_SAFE_INTEGER;
    return br - ar;
  });

  return { candidates, rejected };
}

/**
 * Statuses a backdated correction may draw on.
 *
 *   active    — obviously.
 *   expired   — the row lapsed AFTER the class. Lifecycle set this;
 *               it says nothing about the class date.
 *   exhausted — credits ran out at some point. The balance check
 *               below still applies, so this only passes when there
 *               is genuinely something left.
 *
 * `paused` and `cancelled` are excluded: those are deliberate
 * withdrawals by an admin or the student, not artefacts of time.
 */
function isEligibleStatusForBackdate(status: MockSubscription["status"]): boolean {
  return status === "active" || status === "expired" || status === "exhausted";
}

/**
 * Work out WHY an entitlement was rejected, so the admin gets a
 * specific explanation instead of a bare "not eligible".
 *
 * Checks in the order a human would ask them: did it cover the date,
 * then did it have a credit left, then did it cover this class.
 */
function classifyRejection(
  sub: MockSubscription,
  cls: ClassContext,
  rule: ProductAccessRule | undefined,
  asOf: string,
): BackdateIneligibleReason {
  if (asOf < sub.validFrom) return "not_valid_on_class_date";
  if (sub.validUntil && asOf > sub.validUntil) return "not_valid_on_class_date";

  const snap = getCreditSnapshot(sub, asOf);
  if (snap.model !== "unlimited" && (snap.historicalRemaining ?? 0) <= 0) {
    return "no_credit_available";
  }

  // Window and balance were fine, so it must be the access rule
  // (wrong style, level or class type), or a missing rule entirely.
  if (!rule) return "class_not_covered";
  return "class_not_covered";
}

// ── Admin-facing messages ────────────────────────────────────

export const BACKDATE_NO_ENTITLEMENT_MESSAGE =
  "No valid membership or pass was available for this student on the class date.";

/**
 * Expand the generic message with the most useful specific reason,
 * so the admin knows whether to fix the data or use a different tool.
 */
export function describeBackdateRejections(rejected: BackdateRejection[]): string {
  if (rejected.length === 0) return BACKDATE_NO_ENTITLEMENT_MESSAGE;

  // Report the most actionable reason present.
  const priority: BackdateIneligibleReason[] = [
    "no_credit_available",
    "class_not_covered",
    "not_valid_on_class_date",
    "status_not_bookable",
  ];
  const found = priority.find((p) => rejected.some((r) => r.reason === p));
  const hit = rejected.find((r) => r.reason === found);

  switch (found) {
    case "no_credit_available":
      return `${BACKDATE_NO_ENTITLEMENT_MESSAGE} ${hit?.productName} covered this class but had no credits left.`;
    case "class_not_covered":
      return `${BACKDATE_NO_ENTITLEMENT_MESSAGE} ${hit?.productName} was active but does not cover this class type, style or level.`;
    case "not_valid_on_class_date":
      return `${BACKDATE_NO_ENTITLEMENT_MESSAGE} ${hit?.productName} did not cover the class date.`;
    case "status_not_bookable":
      return `${BACKDATE_NO_ENTITLEMENT_MESSAGE} ${hit?.productName} was paused or cancelled.`;
    default:
      return BACKDATE_NO_ENTITLEMENT_MESSAGE;
  }
}

// ── Existing-booking classification (Phase 19.1) ────────────

/**
 * What an existing booking means for entitlement consumption.
 *
 * The naive assumption "a booking row exists, therefore the credit
 * was already spent" is WRONG for three of BPM's five statuses. Every
 * cancel path restores the credit, and marking a student absent
 * restores it too. Acting on the row's mere existence would leave a
 * backdated attendance with no corresponding consumption — the exact
 * inverse of the bug this feature was built to fix.
 *
 * Verified against the code that actually moves the counters:
 *   - booking creation consumes           (bookings-admin.ts, booking.ts)
 *   - cancelBooking / cancelBookingAsAdmin restore, late or not
 *     (booking-student.ts, bookings-admin.ts)
 *   - attendance excused always restores  (attendance.ts::adjustEntitlement)
 *   - attendance absent restores ONLY when `refundCreditOnAbsent`
 *     (attendance.ts: `prevConsumed = !settings.refundCreditOnAbsent`)
 *   - the closure job moves a booking to `missed` and touches NO
 *     counters at all (attendance-closure.ts calls only `markMissed`)
 *
 * That last pair is why `missed` cannot be classified from the
 * booking status alone. Two different histories produce it:
 *
 *   closure (no attendance row) → credit still spent
 *   admin marked `absent`       → credit returned only if the
 *                                 academy refunds absences
 *
 * With `refundCreditOnAbsent = false` — the BPM default — neither
 * path returns the credit, so treating `missed` as "restored" would
 * charge the student a SECOND credit for a class they already paid
 * for. The attendance record is the signal that tells them apart.
 */
export type BookingConsumptionState =
  /** The credit is currently spent on this booking. Do not consume again. */
  | "consumed"
  /** The credit was restored (or never taken). Consume exactly one now. */
  | "restored"
  /** Cannot be reconciled automatically. */
  | "invalid";

export interface BookingClassification {
  state: BookingConsumptionState;
  /** True when the booking row must be reinstated rather than duplicated. */
  needsReinstatement: boolean;
  /** Status to move the booking to when correcting. */
  targetStatus: "checked_in" | null;
  /** Plain-language note for the admin dialog and the audit entry. */
  note: string;
}

export interface BookingClassificationContext {
  /**
   * Status of any attendance row already recorded for this student
   * and class. `null`/absent means none was ever written, which for a
   * `missed` booking identifies the closure-job path.
   */
  previousAttendanceStatus?: string | null;
  /**
   * The `refundCreditOnAbsent` business rule. Defaults to `false`,
   * matching the BPM default: an absence forfeits the credit.
   */
  refundCreditOnAbsent?: boolean;
}

/**
 * Whether an existing attendance row already handed the credit back.
 *
 * Mirrors `adjustEntitlement`: excused always refunds, absent refunds
 * only when the academy has opted into it, and present/late leave the
 * credit spent.
 */
function attendanceReturnedTheCredit(
  previousAttendanceStatus: string | null | undefined,
  refundCreditOnAbsent: boolean,
): boolean {
  if (previousAttendanceStatus === "excused") return true;
  if (previousAttendanceStatus === "absent") return refundCreditOnAbsent;
  return false;
}

/**
 * Classify every `BookingStatus`. Exhaustive by construction — the
 * switch has no default, so adding a status to the union is a
 * compile error here rather than a silent miscount.
 */
export function classifyExistingBooking(
  status: "confirmed" | "checked_in" | "cancelled" | "late_cancelled" | "missed",
  context: BookingClassificationContext = {},
): BookingClassification {
  const refunded = attendanceReturnedTheCredit(
    context.previousAttendanceStatus,
    context.refundCreditOnAbsent ?? false,
  );

  switch (status) {
    case "confirmed":
      // An `excused` (or refunded `absent`) row against a still-
      // confirmed booking means the credit went back even though the
      // booking never changed status — excused deliberately leaves it
      // alone. Treating this as "consumed" would grant a free class.
      return refunded
        ? {
            state: "restored",
            needsReinstatement: false,
            targetStatus: "checked_in",
            note: "The credit for this booking was given back when the student was marked absent or excused. Correcting it will consume one credit again.",
          }
        : {
            state: "consumed",
            needsReinstatement: false,
            targetStatus: "checked_in",
            note: "A credit was already consumed when this booking was made.",
          };
    case "checked_in":
      return {
        state: "consumed",
        needsReinstatement: false,
        targetStatus: null,
        note: "Already checked in; the credit was consumed when the booking was made.",
      };
    case "cancelled":
      return {
        state: "restored",
        needsReinstatement: true,
        targetStatus: "checked_in",
        note: "This booking was cancelled and the credit was given back. Correcting it will reinstate the booking and consume one credit again.",
      };
    case "late_cancelled":
      return {
        state: "restored",
        needsReinstatement: true,
        targetStatus: "checked_in",
        note: "This booking was late-cancelled and the credit was given back. Correcting it will reinstate the booking, consume one credit, and void the late-cancel penalty.",
      };
    case "missed":
      // The credit was spent at booking time. Only an attendance row
      // can have returned it; the closure job never does.
      return refunded
        ? {
            state: "restored",
            needsReinstatement: true,
            targetStatus: "checked_in",
            note: "This booking was marked as missed and the credit was given back. Correcting it will reinstate the booking, consume one credit, and void the no-show penalty.",
          }
        : {
            state: "consumed",
            needsReinstatement: true,
            targetStatus: "checked_in",
            note: "This booking was marked as missed but the credit was never given back, so no further credit is due. Correcting it will reinstate the booking and void the no-show penalty.",
          };
  }
}

/** Statuses whose penalty should be voided when attendance is proven. */
export function shouldVoidPenaltyOnCorrection(
  status: "confirmed" | "checked_in" | "cancelled" | "late_cancelled" | "missed" | null,
  previousAttendanceStatus: string | null,
): boolean {
  if (previousAttendanceStatus === "absent") return true;
  return status === "late_cancelled" || status === "missed";
}

// ── Class-level guards ───────────────────────────────────────

export type BackdateClassBlock =
  | { ok: true }
  | { ok: false; reason: "future_class" | "cancelled_class"; message: string };

/**
 * Whether this class may be corrected at all.
 *
 * A future class is not a history problem — the normal booking and
 * check-in flow applies, and routing it through here would let an
 * admin pre-consume a credit for a class nobody has attended.
 *
 * A cancelled class has no attendance to correct. Recording someone
 * as present at a class that did not happen would corrupt both the
 * attendance figures and the student's credit balance.
 */
export function checkBackdateClassEligibility(input: {
  classDate: string;
  classStatus: string | null | undefined;
  today: string;
}): BackdateClassBlock {
  if (input.classDate > input.today) {
    return {
      ok: false,
      reason: "future_class",
      message:
        "This class has not happened yet. Use the normal booking and check-in flow instead of a historical correction.",
    };
  }
  if (input.classStatus === "cancelled") {
    return {
      ok: false,
      reason: "cancelled_class",
      message:
        "This class was cancelled, so there is no attendance to correct.",
    };
  }
  return { ok: true };
}
