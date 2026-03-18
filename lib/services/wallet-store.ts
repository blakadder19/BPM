/**
 * Read-only in-memory wallet transaction store, seeded from mock data.
 * In production, replace with Supabase query on wallet_transactions.
 */

import { WALLET_TRANSACTIONS, type MockWalletTx } from "@/lib/mock-data";

let txs: MockWalletTx[] | null = null;

export function getWalletTransactions(): MockWalletTx[] {
  if (!txs) {
    txs = WALLET_TRANSACTIONS.map((t) => ({ ...t }));
  }
  return txs;
}
