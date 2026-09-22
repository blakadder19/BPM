/**
 * Credit service — orchestrates subscription resolution, credit deduction,
 * and wallet transaction logging.
 *
 * Uses an in-memory store for MVP; swap to Supabase when connected.
 */

import { resolveSubscription } from "@/lib/domain/credit-rules";
import type { ActiveSubscription } from "@/lib/domain/credit-rules";
import { isSubscriptionUsable } from "@/lib/domain/credit-availability";
import { getTodayStr } from "@/lib/domain/datetime";
import type { ProductAccessRule } from "@/config/product-access";
import { generateId } from "@/lib/utils";
import type { ClassType, ProductType, SubscriptionStatus, TxType } from "@/types/domain";

/**
 * Optional runtime override for the credit-deduction priority order.
 * Server callers wire this to `getSettings().creditDeductionPriority`.
 */
export type CreditPriorityOverride = ProductType[] | undefined;

// ── Store types ─────────────────────────────────────────────

export interface StoredSubscription {
  id: string;
  studentId: string;
  productId: string;
  productName: string;
  productType: ProductType;
  status: SubscriptionStatus;
  totalCredits: number | null;
  remainingCredits: number | null;
  validFrom: string;
  validUntil: string | null;
  selectedStyleId: string | null;
  selectedStyleIds: string[] | null;
}

export interface StoredWalletTx {
  id: string;
  studentId: string;
  subscriptionId: string | null;
  bookingId: string | null;
  txType: TxType;
  credits: number;
  balanceAfter: number | null;
  description: string;
  createdAt: string;
}

// ── Outcome types ───────────────────────────────────────────

export interface CreditDeductionResult {
  deducted: boolean;
  subscriptionId: string | null;
  subscriptionName: string | null;
  creditsRemaining: number | null;
  walletTxId: string | null;
  reason: string;
}

export interface CreditRefundResult {
  refunded: boolean;
  subscriptionId: string | null;
  creditsRemaining: number | null;
  walletTxId: string | null;
  reason: string;
}

// ── Service ─────────────────────────────────────────────────

export class CreditService {
  subscriptions: StoredSubscription[];
  walletTxs: StoredWalletTx[];

  constructor(
    initialSubscriptions: StoredSubscription[] = [],
    initialWalletTxs: StoredWalletTx[] = []
  ) {
    this.subscriptions = [...initialSubscriptions];
    this.walletTxs = [...initialWalletTxs];
  }

  /**
   * Deduct a credit for a confirmed class booking.
   * Returns information about which subscription was used and remaining balance.
   */
  deductForBooking(params: {
    studentId: string;
    bookingId: string;
    classType: ClassType;
    danceStyleId: string | null;
    level: string | null;
    className: string;
    accessRules?: Map<string, ProductAccessRule>;
    /** Phase 2B: runtime priority override (settings.creditDeductionPriority). */
    deductionPriority?: CreditPriorityOverride;
    /** Phase 16: "now" for the expiry check. Defaults to the real today. */
    today?: string;
  }): CreditDeductionResult {
    // Phase 16 — `status === "active"` alone is not enough: a row
    // whose term ended yesterday still reads active until the nightly
    // lifecycle job flips it. Filter on the validity window too so an
    // expired pass can never fund a booking or a penalty deduction.
    const today = params.today ?? getTodayStr();
    const studentSubs = this.subscriptions.filter(
      (s) => s.studentId === params.studentId && isSubscriptionUsable(s, today),
    );

    if (studentSubs.length === 0) {
      return noDeduction("No active subscription found");
    }

    const activeSubs: ActiveSubscription[] = studentSubs.map((s) => ({
      id: s.id,
      productId: s.productId,
      productType: s.productType,
      remainingCredits: s.remainingCredits,
      danceStyleId: null,
      allowedLevels: null,
      selectedStyleId: s.selectedStyleId,
      selectedStyleIds: s.selectedStyleIds,
    }));

    const chosen = resolveSubscription(
      activeSubs,
      {
        classType: params.classType,
        danceStyleId: params.danceStyleId,
        level: params.level,
      },
      params.accessRules,
      params.deductionPriority,
    );

    if (!chosen) {
      return noDeduction("No subscription covers this class");
    }

    const stored = this.subscriptions.find((s) => s.id === chosen.id);
    if (!stored) {
      return noDeduction("Subscription not found in store");
    }

    if (stored.remainingCredits !== null) {
      stored.remainingCredits = Math.max(0, stored.remainingCredits - 1);
      if (stored.remainingCredits === 0) {
        stored.status = "exhausted";
      }
    }

    const txId = generateId("tx");
    const tx: StoredWalletTx = {
      id: txId,
      studentId: params.studentId,
      subscriptionId: stored.id,
      bookingId: params.bookingId,
      txType: "credit_used",
      credits: -1,
      balanceAfter: stored.remainingCredits,
      description: `Credit used for ${params.className} (${stored.productName})`,
      createdAt: new Date().toISOString(),
    };
    this.walletTxs.push(tx);

    return {
      deducted: true,
      subscriptionId: stored.id,
      subscriptionName: stored.productName,
      creditsRemaining: stored.remainingCredits,
      walletTxId: txId,
      reason: `1 credit deducted from ${stored.productName}`,
    };
  }

  /**
   * Refund a credit back to a subscription (e.g., on-time cancellation).
   */
  refundCredit(params: {
    studentId: string;
    bookingId: string;
    subscriptionId: string;
    className: string;
  }): CreditRefundResult {
    const stored = this.subscriptions.find(
      (s) => s.id === params.subscriptionId && s.studentId === params.studentId
    );

    if (!stored) {
      return { refunded: false, subscriptionId: null, creditsRemaining: null, walletTxId: null, reason: "Subscription not found" };
    }

    if (stored.remainingCredits !== null) {
      stored.remainingCredits += 1;
      if (stored.status === "exhausted") {
        stored.status = "active";
      }
    }

    const txId = generateId("tx");
    const tx: StoredWalletTx = {
      id: txId,
      studentId: params.studentId,
      subscriptionId: stored.id,
      bookingId: params.bookingId,
      txType: "credit_refunded",
      credits: 1,
      balanceAfter: stored.remainingCredits,
      description: `Credit refunded for ${params.className} (${stored.productName})`,
      createdAt: new Date().toISOString(),
    };
    this.walletTxs.push(tx);

    return {
      refunded: true,
      subscriptionId: stored.id,
      creditsRemaining: stored.remainingCredits,
      walletTxId: txId,
      reason: `1 credit refunded to ${stored.productName}`,
    };
  }

  // ── Queries ─────────────────────────────────────────────────

  /**
   * Subscriptions that can currently fund something — used by the
   * penalty path to decide whether a late-cancel/no-show can be paid
   * with a credit instead of a fee.
   *
   * Phase 16: filters on the validity window as well as status, so an
   * expired pass's leftover credits are never taken as a penalty.
   */
  getActiveSubscriptionsForStudent(
    studentId: string,
    today: string = getTodayStr(),
  ): StoredSubscription[] {
    return this.subscriptions.filter(
      (s) => s.studentId === studentId && isSubscriptionUsable(s, today),
    );
  }

  getAllSubscriptionsForStudent(studentId: string): StoredSubscription[] {
    return this.subscriptions.filter((s) => s.studentId === studentId);
  }

  getWalletTxsForStudent(studentId: string): StoredWalletTx[] {
    return this.walletTxs
      .filter((tx) => tx.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getSubscriptionById(id: string): StoredSubscription | undefined {
    return this.subscriptions.find((s) => s.id === id);
  }
}

function noDeduction(reason: string): CreditDeductionResult {
  return {
    deducted: false,
    subscriptionId: null,
    subscriptionName: null,
    creditsRemaining: null,
    walletTxId: null,
    reason,
  };
}
