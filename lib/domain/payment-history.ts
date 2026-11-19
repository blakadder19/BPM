/**
 * Rows for the student Payments page.
 *
 * Built on the canonical receipt rule: a row offers "Download receipt"
 * exactly when `buildReceiptData` would produce a receipt, so the list and
 * the PDF routes can never disagree. Amounts are the frozen purchase
 * amounts, shown as stored.
 */
import {
  buildReceiptData,
  noPaymentLabel,
  type NoPaymentLabel,
  type ReceiptBuildContext,
  type ReceiptSource,
  type ReceiptSourceType,
} from "@/lib/domain/receipts";
import { receiptItemTypeLabel, receiptSourceLabel } from "@/lib/domain/receipt-format";

export type PaymentReceiptAction =
  | { kind: "download"; href: string }
  /** Nothing was paid (complimentary, free, €0 after discount). */
  | { kind: "no_payment"; label: NoPaymentLabel }
  | { kind: "awaiting_payment" }
  /** Paid, but the record cannot support a receipt (e.g. incomplete refund data). */
  | { kind: "unavailable" };

export interface PaymentHistoryItem {
  key: string;
  sourceType: ReceiptSourceType;
  id: string;
  /** paid_at, else assigned_at / purchased_at. */
  recordedAt: string | null;
  itemName: string;
  /** Events: the event title. */
  secondaryLabel: string | null;
  typeLabel: string;
  amountCents: number | null;
  currency: string | null;
  paymentStatus: string;
  paymentStatusLabel: string;
  refundLabel: string | null;
  receipt: PaymentReceiptAction;
}

export function receiptHref(sourceType: ReceiptSourceType, id: string): string {
  switch (sourceType) {
    case "subscription":
      return `/api/receipts/subscription/${encodeURIComponent(id)}`;
    case "event_purchase":
      return `/api/receipts/event/${encodeURIComponent(id)}`;
    default: {
      const unreachable: never = sourceType;
      throw new Error(`Unhandled receipt source: ${String(unreachable)}`);
    }
  }
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  complimentary: "Complimentary",
  waived: "Waived",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

function trimmed(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

export interface PaymentHistoryOptions {
  ctx: ReceiptBuildContext;
  /**
   * Display-only fallback for event purchases that predate the frozen
   * event title. Never used on a receipt.
   */
  liveEventTitle?: string | null;
}

export function toPaymentHistoryItem(source: ReceiptSource, opts: PaymentHistoryOptions): PaymentHistoryItem {
  const built = buildReceiptData(source, opts.ctx);
  const row = source.row;

  let itemName: string;
  let secondaryLabel: string | null;
  let typeLabel: string;
  let amountCents: number | null;
  let currency: string | null;
  let recordedAt: string | null;
  switch (source.kind) {
    case "subscription": {
      const r = source.row;
      itemName = trimmed(r.productNameSnapshot) ?? trimmed(r.productName) ?? "Purchase";
      secondaryLabel = null;
      typeLabel = receiptItemTypeLabel(r.productTypeSnapshot ?? r.productType) ?? receiptSourceLabel("subscription");
      amountCents = r.priceCentsAtPurchase;
      currency = trimmed(r.currencyAtPurchase)?.toUpperCase() ?? null;
      recordedAt = trimmed(r.paidAt) ?? trimmed(r.assignedAt);
      break;
    }
    case "event_purchase": {
      const r = source.row;
      itemName = trimmed(r.productNameSnapshot) ?? "Event purchase";
      secondaryLabel = trimmed(r.eventTitleSnapshot) ?? trimmed(opts.liveEventTitle);
      typeLabel = receiptSourceLabel("event_purchase");
      amountCents = r.paidAmountCents;
      currency = trimmed(r.currency)?.toUpperCase() ?? null;
      recordedAt = trimmed(r.paidAt) ?? trimmed(r.purchasedAt);
      break;
    }
    default: {
      const unreachable: never = source;
      throw new Error(`Unhandled receipt source: ${JSON.stringify(unreachable)}`);
    }
  }

  let receipt: PaymentReceiptAction;
  let refundLabel: string | null = null;
  if (built.ok) {
    receipt = { kind: "download", href: receiptHref(source.kind, row.id) };
    const refund = built.receipt.refund;
    if (refund) refundLabel = refund.fullRefund ? "Refunded" : "Partially refunded";
    else if (built.receipt.warnings.includes("refund_pending_not_included")) refundLabel = "Refund pending";
  } else {
    const noPayment = noPaymentLabel(source);
    if (noPayment) receipt = { kind: "no_payment", label: noPayment };
    else if (built.reason === "payment_pending") receipt = { kind: "awaiting_payment" };
    else receipt = { kind: "unavailable" };
    if (row.paymentStatus === "refunded") refundLabel = "Refunded";
    else if (row.refundStatus === "pending") refundLabel = "Refund pending";
  }

  return {
    key: `${source.kind}:${row.id}`,
    sourceType: source.kind,
    id: row.id,
    recordedAt,
    itemName,
    secondaryLabel,
    typeLabel,
    amountCents: typeof amountCents === "number" && Number.isInteger(amountCents) ? amountCents : null,
    currency,
    paymentStatus: row.paymentStatus,
    paymentStatusLabel: PAYMENT_STATUS_LABELS[row.paymentStatus] ?? "Unknown",
    refundLabel,
    receipt,
  };
}

/** Newest first; rows without a date sort last. */
export function sortPaymentHistory(items: PaymentHistoryItem[]): PaymentHistoryItem[] {
  const time = (i: PaymentHistoryItem) => {
    const t = i.recordedAt ? new Date(i.recordedAt).getTime() : NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...items].sort((a, b) => time(b) - time(a));
}
