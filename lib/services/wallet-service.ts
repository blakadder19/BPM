import { getWalletTransactions as mockGetAll } from "@/lib/services/wallet-store";
import type { MockWalletTx } from "@/lib/mock-data";

const isDev = process.env.NODE_ENV === "development";

export async function getWalletTransactions(): Promise<MockWalletTx[]> {
  if (isDev) return mockGetAll();

  // PROVISIONAL: production reads from wallet_transactions table
  return [];
}
