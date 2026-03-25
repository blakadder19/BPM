/**
 * Pure domain logic for Studio Hire deposit tracking and cancellation outcomes.
 *
 * All amounts are in cents. The UI converts to/from euros for display.
 * Structured so automated cancellation policy rules can replace the
 * manual admin-driven logic later without changing the data model.
 */

import type { StudioHireCancellationOutcome } from "@/types/domain";

// ── Deposit balance ──────────────────────────────────────────

export interface DepositSummary {
  requiredCents: number;
  paidCents: number;
  balanceDueCents: number;
  isFullyPaid: boolean;
  isOverpaid: boolean;
}

export function computeDepositSummary(
  requiredCents: number | null,
  paidCents: number | null
): DepositSummary | null {
  if (requiredCents == null && paidCents == null) return null;
  const req = requiredCents ?? 0;
  const paid = paidCents ?? 0;
  const balance = req - paid;
  return {
    requiredCents: req,
    paidCents: paid,
    balanceDueCents: Math.max(balance, 0),
    isFullyPaid: paid >= req && req > 0,
    isOverpaid: paid > req,
  };
}

// ── Cancellation outcome labels ──────────────────────────────

const OUTCOME_LABELS: Record<StudioHireCancellationOutcome, string> = {
  no_deposit: "No deposit was taken",
  deposit_retained: "Deposit retained",
  deposit_refunded: "Full deposit refunded",
  deposit_partial_refund: "Partial refund issued",
};

export const CANCELLATION_OUTCOME_OPTIONS: {
  value: StudioHireCancellationOutcome;
  label: string;
}[] = [
  { value: "no_deposit", label: "No deposit was taken" },
  { value: "deposit_retained", label: "Retain deposit (per policy)" },
  { value: "deposit_refunded", label: "Refund full deposit" },
  { value: "deposit_partial_refund", label: "Partial refund" },
];

export function getOutcomeLabel(
  outcome: StudioHireCancellationOutcome | null
): string {
  if (!outcome) return "";
  return OUTCOME_LABELS[outcome] ?? outcome;
}

// ── Cancellation summary ─────────────────────────────────────

export interface CancellationSummary {
  outcomeLabel: string;
  refundedCents: number;
  retainedCents: number;
}

export function computeCancellationSummary(
  outcome: StudioHireCancellationOutcome | null,
  depositPaidCents: number | null,
  refundedCents: number | null
): CancellationSummary | null {
  if (!outcome) return null;
  const paid = depositPaidCents ?? 0;
  const refunded = refundedCents ?? 0;

  return {
    outcomeLabel: getOutcomeLabel(outcome),
    refundedCents: refunded,
    retainedCents: Math.max(paid - refunded, 0),
  };
}

// ── EUR formatting ───────────────────────────────────────────

export function centsToEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function eurToCents(eur: string): number | null {
  const n = parseFloat(eur);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}
