/**
 * Phase 16 — end-of-term credit expiry.
 *
 * Builds on Phase 14 (term-based subscriptions expire on the selected
 * term's end date). Phase 14 fixed *validity*; this module makes the
 * *credit* consequence explicit:
 *
 *   When a term-based pass or membership passes its `validUntil`, any
 *   unused credits stop being bookable — but the historical record of
 *   what was bought and what was used is preserved exactly as-is.
 *
 * ── The central distinction ────────────────────────────────
 *
 *   historicalRemaining — what was left over. Always derivable, even
 *                         years later. Never mutated by expiry.
 *   usableRemaining     — what can be booked RIGHT NOW. Zero once the
 *                         subscription is past its validity window or
 *                         its status no longer permits booking.
 *
 * Worked example from the brief (Silver Pass, 8 credits, 3 used,
 * term ended):
 *
 *   totalCredits        8
 *   consumedCredits     3
 *   historicalRemaining 5   ← preserved forever
 *   usableRemaining     0   ← cannot be booked
 *
 * We deliberately do NOT zero `totalCredits` or `remainingCredits` on
 * the row to force `usableRemaining` to 0. Mutating the counters would
 * destroy the truth of what the student actually paid for and used,
 * which Finance and any future dispute depend on.
 *
 * Pure: no IO, no repository access. Safe to import from server
 * actions and client components alike so booking enforcement and UI
 * display can never disagree about what "remaining" means.
 */

import type { MockSubscription } from "@/lib/mock-data";
import type { SubscriptionStatus } from "@/types/domain";

// ── Which statuses permit booking ───────────────────────────

/**
 * Only `active` permits consuming an entitlement.
 *
 *   * `paused`    — deliberately suspended; credits are retained but
 *                   not spendable until reactivated.
 *   * `expired`   — validity window passed.
 *   * `exhausted` — credits already fully consumed.
 *   * `cancelled` — ended early.
 *
 * Declared as a Set rather than inline comparisons so every call site
 * agrees, and so adding a future bookable status is a one-line change.
 */
export const BOOKABLE_SUBSCRIPTION_STATUSES: ReadonlySet<SubscriptionStatus> =
  new Set<SubscriptionStatus>(["active"]);

/**
 * Accepts a plain `string` as well as the union so UI view-models
 * (which widen `status` to `string`) can call this without a cast.
 * An unrecognised value falls through to `false`, which is the safe
 * direction: unknown statuses never permit spending credits.
 */
export function statusPermitsBooking(status: SubscriptionStatus | string): boolean {
  return BOOKABLE_SUBSCRIPTION_STATUSES.has(status as SubscriptionStatus);
}

// ── Types ────────────────────────────────────────────────────

/**
 * BPM runs two parallel accounting models on the same table:
 *
 *   "credits"     — passes and drop-ins. `totalCredits` /
 *                   `remainingCredits`, decremented per booking.
 *   "class_count" — memberships. `classesPerTerm` / `classesUsed`,
 *                   incremented per booking.
 *   "unlimited"   — neither cap is set; the entitlement never runs out
 *                   within its validity window.
 */
export type CreditModel = "credits" | "class_count" | "unlimited";

/**
 * Why a subscription with leftover credits cannot spend them.
 * `null` when it can.
 */
export type UnusableReason =
  | "expired"
  | "not_started"
  | "status"
  | "exhausted"
  | null;

export interface CreditSnapshot {
  model: CreditModel;
  /** Cap for this entitlement. Null for unlimited. */
  totalCredits: number | null;
  /** How many have been consumed. Always a number (0 when none). */
  consumedCredits: number;
  /**
   * Unused count — the HISTORICAL figure. Survives expiry untouched
   * so "5 unused credits expired at the end of Term 5" is always
   * answerable. Null for unlimited entitlements.
   */
  historicalRemaining: number | null;
  /**
   * What can actually be booked right now. 0 when the entitlement is
   * outside its validity window or its status does not permit
   * booking. Null means unlimited-and-currently-usable.
   */
  usableRemaining: number | null;
  /** True when the entitlement can currently be used at all. */
  isUsable: boolean;
  /** Populated when `isUsable` is false. */
  unusableReason: UnusableReason;
  /**
   * True specifically when the validity window has passed — as
   * opposed to paused/cancelled. Drives the "expired at the end of
   * <term>" copy.
   */
  isPastValidity: boolean;
  /** `validUntil` when the window has passed, else null. */
  expiredOn: string | null;
}

/**
 * The subset of a subscription this module reads. Declared as a `Pick`
 * so tests and lightweight view-models can be passed in without
 * constructing a whole `MockSubscription`.
 */
export type CreditBearingSubscription = Omit<
  Pick<
    MockSubscription,
    | "status"
    | "validFrom"
    | "validUntil"
    | "totalCredits"
    | "remainingCredits"
    | "classesPerTerm"
    | "classesUsed"
    | "productType"
  >,
  "status"
> & {
  /** Widened to `string` so UI view-models can be passed directly. */
  status: SubscriptionStatus | string;
};

// ── Validity ─────────────────────────────────────────────────

/**
 * Is this subscription inside its validity window on `today`?
 *
 * `validUntil` is INCLUSIVE — a pass whose term ends on 2026-08-16 is
 * still usable all day on the 16th and stops on the 17th. This matches
 * `isSubscriptionExpired` in term-lifecycle.ts (`today > validUntil`),
 * so lifecycle and booking enforcement agree on the boundary day.
 */
export function isWithinValidityWindow(
  sub: Pick<CreditBearingSubscription, "validFrom" | "validUntil">,
  today: string,
): boolean {
  if (sub.validFrom && today < sub.validFrom) return false;
  if (sub.validUntil && today > sub.validUntil) return false;
  return true;
}

/**
 * Has the validity window passed as of `today`? Distinct from the
 * row's `status`, because lifecycle runs on a schedule and a row can
 * legitimately still read `active` for a few hours after its term
 * ended. Booking enforcement must not wait for lifecycle.
 */
export function isPastValidity(
  sub: Pick<CreditBearingSubscription, "validUntil">,
  today: string,
): boolean {
  return !!sub.validUntil && today > sub.validUntil;
}

/**
 * Can this subscription be used to pay for something right now?
 *
 * This is the single predicate every booking path should consult. It
 * is intentionally stricter than "status === active": a row whose term
 * ended yesterday is unusable immediately, whether or not the nightly
 * lifecycle job has got around to flipping its status.
 */
export function isSubscriptionUsable(
  sub: Pick<CreditBearingSubscription, "status" | "validFrom" | "validUntil">,
  today: string,
): boolean {
  if (!statusPermitsBooking(sub.status)) return false;
  return isWithinValidityWindow(sub, today);
}

// ── Credit snapshot ──────────────────────────────────────────

function resolveModel(sub: CreditBearingSubscription): CreditModel {
  // Memberships are class-counted when a per-term cap is configured.
  if (sub.productType === "membership" && sub.classesPerTerm !== null) {
    return "class_count";
  }
  if (sub.totalCredits !== null || sub.remainingCredits !== null) {
    return "credits";
  }
  return "unlimited";
}

/**
 * Build the full credit picture for a subscription on a given day.
 *
 * This is the one function UI and booking logic should share, so a
 * student can never be shown "5 remaining" for credits the booking
 * engine would refuse to spend.
 */
export function getCreditSnapshot(
  sub: CreditBearingSubscription,
  today: string,
): CreditSnapshot {
  const model = resolveModel(sub);
  const pastValidity = isPastValidity(sub, today);
  const notStarted = !!sub.validFrom && today < sub.validFrom;
  const statusOk = statusPermitsBooking(sub.status);

  let totalCredits: number | null;
  let consumedCredits: number;
  let historicalRemaining: number | null;

  if (model === "class_count") {
    totalCredits = sub.classesPerTerm;
    consumedCredits = Math.max(0, sub.classesUsed ?? 0);
    historicalRemaining = Math.max(0, (sub.classesPerTerm ?? 0) - consumedCredits);
  } else if (model === "credits") {
    totalCredits = sub.totalCredits;
    const remaining = Math.max(0, sub.remainingCredits ?? 0);
    historicalRemaining = remaining;
    // Derive consumed from total − remaining. When `totalCredits` is
    // null (legacy rows that only ever tracked remaining) we cannot
    // know how many were consumed, so report 0 rather than guess.
    consumedCredits =
      sub.totalCredits !== null ? Math.max(0, sub.totalCredits - remaining) : 0;
  } else {
    totalCredits = null;
    consumedCredits = Math.max(0, sub.classesUsed ?? 0);
    historicalRemaining = null;
  }

  // Ordering matters for the message shown to the student: an expired
  // pass reads as expired even if it also happened to run out.
  let unusableReason: UnusableReason = null;
  if (pastValidity) unusableReason = "expired";
  else if (notStarted) unusableReason = "not_started";
  else if (!statusOk) unusableReason = "status";
  else if (historicalRemaining !== null && historicalRemaining === 0) {
    unusableReason = "exhausted";
  }

  const withinWindow = !pastValidity && !notStarted;
  const isUsable =
    statusOk && withinWindow && (historicalRemaining === null || historicalRemaining > 0);

  return {
    model,
    totalCredits,
    consumedCredits,
    historicalRemaining,
    // The whole point: leftover credits collapse to 0 usable the
    // moment the entitlement stops being valid. The counters above
    // are untouched.
    usableRemaining: statusOk && withinWindow ? historicalRemaining : 0,
    isUsable,
    unusableReason,
    isPastValidity: pastValidity,
    expiredOn: pastValidity ? sub.validUntil : null,
  };
}

/**
 * Convenience wrapper: how many credits can be spent right now.
 *
 * Returns `null` for an unlimited entitlement that is currently
 * usable (callers treat null as "no cap"), and `0` for anything
 * expired, paused, cancelled, not-yet-started, or exhausted.
 */
export function usableRemainingCredits(
  sub: CreditBearingSubscription,
  today: string,
): number | null {
  const snap = getCreditSnapshot(sub, today);
  if (!snap.isUsable) return 0;
  return snap.historicalRemaining;
}

/**
 * True when there are leftover credits that can no longer be spent.
 * Drives the "5 unused credits expired at the end of Term 5" copy, so
 * it deliberately returns false for an entitlement that simply ran
 * out — nothing was lost in that case.
 */
export function hasUnusedExpiredCredits(
  sub: CreditBearingSubscription,
  today: string,
): boolean {
  const snap = getCreditSnapshot(sub, today);
  if (!snap.isPastValidity) return false;
  return (snap.historicalRemaining ?? 0) > 0;
}

// ── Display copy ─────────────────────────────────────────────

/**
 * Student-facing balance label.
 *
 * Never says "N remaining" for an entitlement that cannot be used —
 * that wording implies the credits are still spendable, which is
 * exactly the confusion this phase exists to remove.
 *
 * @param termName Optional term label so an expired pass can say
 *                 "expired at the end of Term 5" rather than a bare date.
 */
export function describeCreditBalance(
  sub: CreditBearingSubscription,
  today: string,
  termName?: string | null,
): string {
  const snap = getCreditSnapshot(sub, today);
  const noun = snap.model === "class_count" ? "classes" : "credits";

  if (snap.model === "unlimited") {
    return snap.isUsable ? "Unlimited" : "Unlimited (ended)";
  }

  const used = `${snap.consumedCredits} of ${snap.totalCredits ?? "—"} ${noun} used`;

  if (snap.isPastValidity) {
    const leftover = snap.historicalRemaining ?? 0;
    if (leftover === 0) return used;
    const when = termName
      ? `at the end of ${termName}`
      : snap.expiredOn
        ? `on ${snap.expiredOn}`
        : "when it ended";
    return `${used} · ${leftover} unused ${noun} expired ${when}`;
  }

  if (!snap.isUsable && snap.unusableReason === "status") {
    const leftover = snap.historicalRemaining ?? 0;
    return `${used} · ${leftover} unused (${sub.status})`;
  }

  return `${used} · ${snap.usableRemaining ?? 0} remaining`;
}
