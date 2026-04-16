"use server";

import { requireRole } from "@/lib/auth";
import { getStudentRepo, getSubscriptionRepo, getSpecialEventRepo } from "@/lib/repositories";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import {
  buildSubscriptionTransactions,
  buildEventPurchaseTransactions,
  buildPenaltyTransactions,
  computeMetrics,
  type FinanceTransaction,
  type FinanceMetrics,
} from "@/lib/domain/finance";
import { getAuditLog, type FinanceAuditEntry } from "@/lib/services/finance-audit-log";

export interface FinanceData {
  transactions: FinanceTransaction[];
  metrics: FinanceMetrics;
  auditLog: FinanceAuditEntry[];
}

export async function getFinanceData(): Promise<FinanceData> {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();

  const [allStudents, allSubs] = await Promise.all([
    getStudentRepo().getAll(),
    getSubscriptionRepo().getAll(),
  ]);

  const studentNameMap = new Map(
    allStudents.map((s) => [s.id, { name: s.fullName, email: s.email }]),
  );

  // Subscriptions → transactions (uses snapshot amounts, not current product prices)
  const subTx = buildSubscriptionTransactions(allSubs, studentNameMap);

  // Event purchases → transactions
  let eventTx: FinanceTransaction[] = [];
  try {
    const eventRepo = getSpecialEventRepo();
    const events = await eventRepo.getAllEvents();
    const eventNameMap = new Map(events.map((e) => [e.id, e.title]));
    const allPurchases = (
      await Promise.all(events.map((e) => eventRepo.getPurchasesByEvent(e.id)))
    ).flat();
    eventTx = buildEventPurchaseTransactions(allPurchases, eventNameMap, studentNameMap);
  } catch {
    // Event module may not be active
  }

  // Penalties → transactions
  const penSvc = getPenaltyService();
  const penTx = buildPenaltyTransactions(penSvc.penalties);

  // Merge and sort by date descending
  const transactions = [...subTx, ...eventTx, ...penTx].sort(
    (a, b) => b.date.localeCompare(a.date),
  );

  const metrics = computeMetrics(transactions);

  const auditLog = getAuditLog()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);

  return { transactions, metrics, auditLog };
}
