/**
 * Singleton CreditService instance backed by mock data.
 * In production, replace with Supabase-backed service.
 */

import { CreditService, type StoredSubscription, type StoredWalletTx } from "./credit-service";
import { SUBSCRIPTIONS, WALLET_TRANSACTIONS } from "@/lib/mock-data";

function buildSubscriptions(): StoredSubscription[] {
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

let instance: CreditService | null = null;

export function getCreditService(): CreditService {
  if (!instance) {
    instance = new CreditService(buildSubscriptions(), buildWalletTxs());
  }
  return instance;
}
