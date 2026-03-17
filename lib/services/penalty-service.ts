/**
 * Penalty service — orchestrates penalty creation, credit deduction,
 * and wallet transactions. Auditable by design.
 *
 * Uses an in-memory store for MVP; swap to Supabase when connected.
 */

import {
  penaltiesApplyTo,
  penaltyFeeCents,
  isLateCancellation,
  classStartDateTime,
} from "@/lib/domain/cancellation-rules";
import { resolvePenalty } from "@/lib/domain/penalty-rules";
import type { ActiveSubscription, ClassContext } from "@/lib/domain/credit-rules";
import { generateId } from "@/lib/utils";
import type { PenaltyReason, PenaltyResolution, TxType, ClassType } from "@/types/domain";

// ── Store types ─────────────────────────────────────────────

export interface StoredPenalty {
  id: string;
  studentId: string;
  studentName: string;
  bookingId: string | null;
  bookableClassId: string;
  classTitle: string;
  classDate: string;
  reason: PenaltyReason;
  amountCents: number;
  resolution: PenaltyResolution;
  subscriptionId: string | null;
  creditDeducted: number;
  createdAt: string;
}

export interface PenaltyWalletTx {
  id: string;
  studentId: string;
  subscriptionId: string | null;
  bookingId: string | null;
  penaltyId: string;
  txType: TxType;
  credits: number;
  description: string;
  createdAt: string;
}

// ── Outcome ─────────────────────────────────────────────────

export interface PenaltyOutcome {
  penaltyCreated: boolean;
  penalty: StoredPenalty | null;
  walletTx: PenaltyWalletTx | null;
  description: string;
}

// ── Service ─────────────────────────────────────────────────

export class PenaltyService {
  penalties: StoredPenalty[];
  walletTxs: PenaltyWalletTx[];

  constructor(
    initialPenalties: StoredPenalty[] = [],
    initialWalletTxs: PenaltyWalletTx[] = []
  ) {
    this.penalties = [...initialPenalties];
    this.walletTxs = [...initialWalletTxs];
  }

  /**
   * Assess a late-cancellation penalty.
   * Returns no penalty if:
   *   - the class type is excluded (social, student practice)
   *   - the cancellation was on time (before the cutoff)
   */
  assessLateCancelPenalty(params: {
    studentId: string;
    studentName: string;
    bookingId: string;
    bookableClassId: string;
    classTitle: string;
    classDate: string;
    classStartTime: string;
    classType: ClassType;
    cancelledAt: Date;
    subscriptions: ActiveSubscription[];
    classContext: ClassContext;
  }): PenaltyOutcome {
    if (!penaltiesApplyTo(params.classType)) {
      return noPenalty("No penalty — class type excluded from penalties.");
    }

    const classStart = classStartDateTime(params.classDate, params.classStartTime);
    if (!isLateCancellation(classStart, params.cancelledAt)) {
      return noPenalty("On-time cancellation — no penalty.");
    }

    return this.createPenalty("late_cancel", params);
  }

  /**
   * Assess a no-show penalty.
   * Returns no penalty if the class type is excluded.
   */
  assessNoShowPenalty(params: {
    studentId: string;
    studentName: string;
    bookingId: string;
    bookableClassId: string;
    classTitle: string;
    classDate: string;
    classType: ClassType;
    subscriptions: ActiveSubscription[];
    classContext: ClassContext;
  }): PenaltyOutcome {
    if (!penaltiesApplyTo(params.classType)) {
      return noPenalty("No penalty — class type excluded from penalties.");
    }

    return this.createPenalty("no_show", params);
  }

  /**
   * Batch no-show detection: given a class and its attendance,
   * find confirmed bookings that were marked absent and create penalties.
   */
  processNoShows(params: {
    bookableClassId: string;
    classTitle: string;
    classDate: string;
    classType: ClassType;
    classContext: ClassContext;
    confirmedBookings: Array<{
      bookingId: string;
      studentId: string;
      studentName: string;
      subscriptions: ActiveSubscription[];
    }>;
    absentStudentIds: Set<string>;
  }): PenaltyOutcome[] {
    const outcomes: PenaltyOutcome[] = [];

    for (const booking of params.confirmedBookings) {
      if (!params.absentStudentIds.has(booking.studentId)) continue;

      const outcome = this.assessNoShowPenalty({
        studentId: booking.studentId,
        studentName: booking.studentName,
        bookingId: booking.bookingId,
        bookableClassId: params.bookableClassId,
        classTitle: params.classTitle,
        classDate: params.classDate,
        classType: params.classType,
        subscriptions: booking.subscriptions,
        classContext: params.classContext,
      });
      outcomes.push(outcome);
    }

    return outcomes;
  }

  // ── Queries ─────────────────────────────────────────────────

  getUnresolvedPenalties(): StoredPenalty[] {
    return this.penalties.filter((p) => p.resolution === "monetary_pending");
  }

  getPenaltiesForStudent(studentId: string): StoredPenalty[] {
    return this.penalties.filter((p) => p.studentId === studentId);
  }

  getWalletTxsForStudent(studentId: string): PenaltyWalletTx[] {
    return this.walletTxs.filter((tx) => tx.studentId === studentId);
  }

  getAllPenalties(): StoredPenalty[] {
    return [...this.penalties];
  }

  // ── Internal ────────────────────────────────────────────────

  private createPenalty(
    reason: PenaltyReason,
    params: {
      studentId: string;
      studentName: string;
      bookingId: string;
      bookableClassId: string;
      classTitle: string;
      classDate: string;
      subscriptions: ActiveSubscription[];
      classContext: ClassContext;
    }
  ): PenaltyOutcome {
    const amountCents = penaltyFeeCents(reason);
    const decision = resolvePenalty(
      reason,
      amountCents,
      params.subscriptions,
      params.classContext
    );

    const now = new Date().toISOString();
    const penaltyId = generateId("pen");

    const penalty: StoredPenalty = {
      id: penaltyId,
      studentId: params.studentId,
      studentName: params.studentName,
      bookingId: params.bookingId,
      bookableClassId: params.bookableClassId,
      classTitle: params.classTitle,
      classDate: params.classDate,
      reason,
      amountCents,
      resolution: decision.resolution,
      subscriptionId: decision.subscriptionId,
      creditDeducted: decision.creditDeducted,
      createdAt: now,
    };
    this.penalties.push(penalty);

    let walletTx: PenaltyWalletTx | null = null;

    if (decision.resolution === "credit_deducted" && decision.subscriptionId) {
      walletTx = {
        id: generateId("tx"),
        studentId: params.studentId,
        subscriptionId: decision.subscriptionId,
        bookingId: params.bookingId,
        penaltyId,
        txType: "penalty_charged",
        credits: -decision.creditDeducted,
        description: decision.description,
        createdAt: now,
      };
      this.walletTxs.push(walletTx);
    }

    return {
      penaltyCreated: true,
      penalty,
      walletTx,
      description: decision.description,
    };
  }
}

function noPenalty(description: string): PenaltyOutcome {
  return { penaltyCreated: false, penalty: null, walletTx: null, description };
}
