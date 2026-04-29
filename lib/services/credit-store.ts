/**
 * Singleton CreditService instance.
 * When Supabase is configured, starts empty — real data via subscriptions repo.
 */

import { CreditService, type StoredSubscription, type StoredWalletTx } from "./credit-service";
import { SUBSCRIPTIONS, WALLET_TRANSACTIONS } from "@/lib/mock-data";
import { isSupabaseMode } from "@/lib/config/data-provider";

function buildSubscriptions(): StoredSubscription[] {
  if (isSupabaseMode()) return [];
  return SUBSCRIPTIONS.map((s) => ({
    id: s.id,
    studentId: s.studentId,
    productId: s.productId,
    productName: s.productName,
    productType: s.productType,
    status: s.status,
    totalCredits: s.totalCredits,
    remainingCredits: s.remainingCredits,
    validFrom: s.validFrom,
    validUntil: s.validUntil,
    selectedStyleId: s.selectedStyleId,
    selectedStyleIds: s.selectedStyleIds,
  }));
}

function buildWalletTxs(): StoredWalletTx[] {
  if (isSupabaseMode()) return [];
  return WALLET_TRANSACTIONS.map((tx) => ({
    id: tx.id,
    studentId: tx.studentId,
    subscriptionId: tx.subscriptionId,
    bookingId: tx.bookingId,
    txType: tx.txType,
    credits: tx.credits,
    balanceAfter: tx.balanceAfter,
    description: tx.description,
    createdAt: tx.createdAt,
  }));
}

const g = globalThis as unknown as { __bpm_creditSvc?: CreditService };

export function getCreditService(): CreditService {
  if (!g.__bpm_creditSvc) {
    g.__bpm_creditSvc = new CreditService(buildSubscriptions(), buildWalletTxs());
  }
  return g.__bpm_creditSvc;
}
