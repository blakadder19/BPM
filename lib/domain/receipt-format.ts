/**
 * Presentation helpers shared by the receipt PDF and the student
 * Payments page. Formatting only: amounts are printed exactly as stored,
 * never recalculated.
 */
import { ACADEMY_TIMEZONE } from "@/lib/domain/datetime";
import type { ReceiptSourceType } from "@/lib/domain/receipts";

export function formatReceiptMoney(cents: number, currency: string): string {
  const code = currency.trim().toUpperCase() || "EUR";
  try {
    return new Intl.NumberFormat("en-IE", { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

/** "17 November 2026" in the academy timezone; null for unparseable input. */
export function formatReceiptDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ACADEMY_TIMEZONE,
  }).format(d);
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  membership: "Membership",
  pass: "Pass",
  drop_in: "Drop-in",
  full_pass: "Full Pass",
  combo_pass: "Combo Pass",
  single_session: "Single Session",
  social_ticket: "Social Ticket",
  other: "Other",
};

/** Label for a frozen product type; unknown values are not guessed at. */
export function receiptItemTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return ITEM_TYPE_LABELS[type] ?? null;
}

export function receiptSourceLabel(sourceType: ReceiptSourceType): string {
  switch (sourceType) {
    case "subscription":
      return "Class entitlement";
    case "event_purchase":
      return "Event";
    default: {
      const unreachable: never = sourceType;
      void unreachable;
      return "Purchase";
    }
  }
}

export function receiptPdfFilename(reference: string): string {
  return `BPM-Payment-Receipt-${reference.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}
