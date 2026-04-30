"use server";

import { requireAnyPermission } from "@/lib/staff-permissions";
import { getStudentRepo, getSpecialEventRepo, getSubscriptionRepo, getStaffRepo } from "@/lib/repositories";
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
  await requireAnyPermission(["finance:view", "payments:view", "payments:view_limited"]);
  await ensureOperationalDataHydrated();

  const [allStudents, allSubs] = await Promise.all([
    getStudentRepo().getAll(),
    getSubscriptionRepo().getAll(),
  ]);

  const studentNameMap = new Map(
    allStudents.map((s) => [s.id, { name: s.fullName, email: s.email }]),
  );

  // Identity map used to resolve performer ids to a human-readable
  // name for the Finance "BY" column. Self-purchase rows store the
  // student id; admin manual / qr-checkin paths store the admin's
  // auth user id (UUID) — `student_subscriptions.assigned_by` is a
  // UUID FK to users(id). To label those rows correctly we also need
  // staff identities, so fold them in alongside students. Anything
  // still unknown falls through to the raw value (legacy rows that
  // pre-date this fix may still hold a name string).
  const identityMap = new Map(studentNameMap);
  try {
    const staff = await getStaffRepo().listStaff();
    for (const s of staff) {
      identityMap.set(s.id, { name: s.fullName, email: s.email });
    }
  } catch {
    // Staff repo may be unavailable in some test contexts; degrade
    // gracefully and let the resolver return raw values.
  }

  // Subscriptions → transactions (uses snapshot amounts, not current product prices)
  const subTx = buildSubscriptionTransactions(allSubs, studentNameMap, identityMap);

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
