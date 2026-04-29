/**
 * Read-only in-memory wallet transaction store.
 * In DATA_PROVIDER=memory mode, seeds from mock data (regardless of
 * whether Supabase env vars are present). In DATA_PROVIDER=supabase
 * mode, starts empty — real data via wallet repo.
 */

import { WALLET_TRANSACTIONS, type MockWalletTx } from "@/lib/mock-data";
import { isSupabaseMode } from "@/lib/config/data-provider";

const g = globalThis as unknown as {
  __bpm_walletTxs?: MockWalletTx[];
};

export function getWalletTransactions(): MockWalletTx[] {
  if (!g.__bpm_walletTxs) {
    g.__bpm_walletTxs = isSupabaseMode() ? [] : WALLET_TRANSACTIONS.map((t) => ({ ...t }));
  }
  return g.__bpm_walletTxs;
}
