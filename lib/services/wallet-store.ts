/**
 * Read-only in-memory wallet transaction store.
 * When Supabase is configured, starts empty — real data via wallet repo.
 */

import { WALLET_TRANSACTIONS, type MockWalletTx } from "@/lib/mock-data";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const g = globalThis as unknown as {
  __bpm_walletTxs?: MockWalletTx[];
};

export function getWalletTransactions(): MockWalletTx[] {
  if (!g.__bpm_walletTxs) {
    g.__bpm_walletTxs = hasSupabaseConfig() ? [] : WALLET_TRANSACTIONS.map((t) => ({ ...t }));
  }
  return g.__bpm_walletTxs;
}
