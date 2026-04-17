/**
 * Unified finance transaction model.
 *
 * Merges subscriptions, event purchases, and penalties into a single
 * flat transaction list for the admin Finance dashboard.
 */

import type { MockSubscription, MockEventPurchase } from "@/lib/mock-data";
import type { StoredPenalty } from "@/lib/services/penalty-service";

// ── Types ────────────────────────────────────────────────────

export type FinanceSource = "subscription" | "event_purchase" | "penalty";
export type FinanceTransactionType = "purchase" | "refund" | "penalty" | "complimentary";
export type FinanceStatus = "paid" | "pending" | "refunded" | "waived" | "complimentary";

export interface FinanceTransaction {
  id: string;
  date: string;
  buyerName: string;
  buyerEmail: string | null;
  studentId: string | null;
  source: FinanceSource;
  productName: string;
  productType: string;
  transactionType: FinanceTransactionType;
  status: FinanceStatus;
  amountCents: number;
  currency: string;
  paymentMethod: string | null;
  reference: string | null;
  performedBy: string | null;
  refundedAt: string | null;
  refundedBy: string | null;
  refundReason: string | null;
}

export interface FinanceMetrics {
  totalPaidCents: number;
  totalPendingCents: number;
  totalRefundedCents: number;
  netRevenueCents: number;
  paidCount: number;
  pendingCount: number;
  refundCount: number;
  byMethod: Record<string, number>;
  bySource: Record<FinanceSource, number>;
  pendingBySource: Record<FinanceSource, number>;
}

// ── Status mapping ───────────────────────────────────────────

function mapSubPaymentStatus(ps: string): FinanceStatus {
  switch (ps) {
    case "paid": return "paid";
    case "pending": return "pending";
    case "refunded": return "refunded";
    case "complimentary": return "complimentary";
    case "waived": return "waived";
    case "cancelled": return "refunded";
    default: return "pending";
  }
}

function mapSubTransactionType(ps: string): FinanceTransactionType {
  if (ps === "refunded" || ps === "cancelled") return "refund";
  if (ps === "complimentary" || ps === "waived") return "complimentary";
  return "purchase";
}

function mapEventStatus(ps: string): FinanceStatus {
  switch (ps) {
    case "paid": return "paid";
    case "pending": return "pending";
    case "refunded": return "refunded";
    default: return "pending";
  }
}

function mapPenaltyStatus(resolution: string): FinanceStatus {
  switch (resolution) {
    case "credit_deducted": return "paid";
    case "monetary_pending": return "pending";
    case "waived": return "waived";
    case "attendance_corrected": return "waived";
    default: return "pending";
  }
}

// ── Builders ────────────────────────────────────────────────

export function buildSubscriptionTransactions(
  subscriptions: MockSubscription[],
  studentNameMap: Map<string, { name: string; email: string }>,
): FinanceTransaction[] {
  return subscriptions.map((sub) => {
    const student = studentNameMap.get(sub.studentId);
    const status = mapSubPaymentStatus(sub.paymentStatus);

    return {
      id: `sub-${sub.id}`,
      date: sub.paidAt ?? sub.assignedAt,
      buyerName: student?.name ?? "Unknown student",
      buyerEmail: student?.email ?? null,
      studentId: sub.studentId,
      source: "subscription" as const,
      productName: sub.productName,
      productType: sub.productType,
      transactionType: mapSubTransactionType(sub.paymentStatus),
      status,
      amountCents: sub.priceCentsAtPurchase ?? 0,
      currency: sub.currencyAtPurchase ?? "EUR",
      paymentMethod: sub.paymentMethod,
      reference: sub.paymentReference,
      performedBy: sub.collectedBy ?? sub.assignedBy,
      refundedAt: sub.refundedAt ?? null,
      refundedBy: sub.refundedBy ?? null,
      refundReason: sub.refundReason ?? null,
    };
  });
}

export function buildEventPurchaseTransactions(
  purchases: MockEventPurchase[],
  eventNameMap: Map<string, string>,
  studentNameMap: Map<string, { name: string; email: string }>,
): FinanceTransaction[] {
  return purchases.map((p) => {
    const eventTitle = eventNameMap.get(p.eventId) ?? "Unknown event";
    const student = p.studentId ? studentNameMap.get(p.studentId) : null;
    const buyerName = student?.name ?? p.guestName ?? "Guest";
    const buyerEmail = student?.email ?? p.guestEmail ?? null;
    const status = mapEventStatus(p.paymentStatus);

    const amount = status === "refunded"
      ? (p.paidAmountCents ?? p.originalAmountCents ?? 0)
      : status === "paid"
        ? (p.paidAmountCents ?? p.originalAmountCents ?? 0)
        : (p.originalAmountCents ?? 0) - (p.discountAmountCents ?? 0);

    return {
      id: `evt-${p.id}`,
      date: p.refundedAt ?? p.paidAt ?? p.purchasedAt,
      buyerName,
      buyerEmail,
      studentId: p.studentId,
      source: "event_purchase" as const,
      productName: p.productNameSnapshot ?? eventTitle,
      productType: p.productTypeSnapshot ?? "event",
      transactionType: status === "refunded" ? "refund" as const : "purchase" as const,
      status,
      amountCents: Math.abs(amount),
      currency: p.currency ?? "EUR",
      paymentMethod: p.paymentMethod,
      reference: p.paymentReference,
      performedBy: p.refundedBy ?? p.checkedInBy,
      refundedAt: p.refundedAt ?? null,
      refundedBy: p.refundedBy ?? null,
      refundReason: p.refundReason ?? null,
    };
  });
}

export function buildPenaltyTransactions(
  penalties: StoredPenalty[],
): FinanceTransaction[] {
  return penalties.map((p) => ({
    id: `pen-${p.id}`,
    date: p.createdAt,
    buyerName: p.studentName,
    buyerEmail: null,
    studentId: p.studentId,
    source: "penalty" as const,
    productName: `${p.reason === "late_cancel" ? "Late cancel" : "No-show"} — ${p.classTitle}`,
    productType: "penalty",
    transactionType: "penalty" as const,
    status: mapPenaltyStatus(p.resolution),
    amountCents: p.amountCents,
    currency: "EUR",
    paymentMethod: null,
    reference: null,
    performedBy: null,
    refundedAt: null,
    refundedBy: null,
    refundReason: null,
  }));
}

// ── Shared status display ────────────────────────────────────

/**
 * Normalize any raw financial/penalty status to a coherent display label.
 * Used by both the Finance dashboard and student financial history.
 */
export function normalizeFinanceStatusLabel(raw: string): string {
  switch (raw) {
    case "paid": return "Paid";
    case "pending": return "Pending";
    case "refunded": return "Refunded";
    case "complimentary": return "Complimentary";
    case "waived": return "Waived";
    case "credit_deducted": return "Paid";
    case "monetary_pending": return "Pending";
    case "attendance_corrected": return "Waived";
    case "cancelled": return "Refunded";
    default: return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
  }
}

export const FINANCE_STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  refunded: "bg-red-100 text-red-700",
  complimentary: "bg-blue-100 text-blue-700",
  waived: "bg-gray-100 text-gray-500",
  credit_deducted: "bg-green-100 text-green-700",
  monetary_pending: "bg-amber-100 text-amber-700",
  attendance_corrected: "bg-gray-100 text-gray-500",
};

// ── Metrics ─────────────────────────────────────────────────

export function computeMetrics(transactions: FinanceTransaction[]): FinanceMetrics {
  const metrics: FinanceMetrics = {
    totalPaidCents: 0,
    totalPendingCents: 0,
    totalRefundedCents: 0,
    netRevenueCents: 0,
    paidCount: 0,
    pendingCount: 0,
    refundCount: 0,
    byMethod: {},
    bySource: { subscription: 0, event_purchase: 0, penalty: 0 },
    pendingBySource: { subscription: 0, event_purchase: 0, penalty: 0 },
  };

  for (const tx of transactions) {
    if (tx.status === "paid") {
      metrics.totalPaidCents += tx.amountCents;
      metrics.paidCount++;
      const method = tx.paymentMethod ?? "other";
      metrics.byMethod[method] = (metrics.byMethod[method] ?? 0) + tx.amountCents;
      metrics.bySource[tx.source] += tx.amountCents;
    } else if (tx.status === "pending") {
      metrics.totalPendingCents += tx.amountCents;
      metrics.pendingCount++;
      metrics.pendingBySource[tx.source] += tx.amountCents;
    } else if (tx.status === "refunded") {
      metrics.totalRefundedCents += tx.amountCents;
      metrics.refundCount++;
    }
  }

  metrics.netRevenueCents = metrics.totalPaidCents - metrics.totalRefundedCents;
  return metrics;
}
