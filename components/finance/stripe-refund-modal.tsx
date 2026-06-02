"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { issueStripeRefundAction } from "@/lib/actions/stripe-refund";

/**
 * Modal for issuing a real Stripe refund against a BPM transaction.
 *
 * Renders the brief's spec verbatim:
 *   * Title:   "Issue Stripe refund"
 *   * Body:    "This will refund the customer through Stripe. This cannot be undone from BPM."
 *   * Fields:  refund amount (full by default), reason, confirmation checkbox
 *   * Success: "Stripe refund created successfully."
 *
 * Validation:
 *   * Amount is enforced as ≤ remaining refundable amount.
 *   * Reason is required (the server enforces this too).
 *   * Confirmation checkbox must be ticked before submit is enabled.
 *
 * Safety:
 *   * Submit button is disabled while in-flight to avoid duplicate clicks.
 *   * Server response is the source of truth — server-side permission /
 *     amount / payment-method gates run before any Stripe call.
 *   * No Stripe ids or secrets are ever rendered other than the
 *     refund id confirmation surfaced after a successful refund.
 */

export interface StripeRefundTarget {
  kind: "subscription" | "event_purchase";
  id: string;
  /** Display name for the refund modal (e.g. "Bronze Bachata Pass"). */
  label: string;
  /** Original paid amount in cents. Drives the "Refund amount" default. */
  paidAmountCents: number;
  /** Cumulative amount already refunded in cents (supports partial refunds). */
  refundedAmountCents: number;
  /** Currency code, lowercased (e.g. "eur"). For display only. */
  currency: string;
}

interface StripeRefundModalProps {
  target: StripeRefundTarget;
  onClose: () => void;
  /** Called after a successful refund so the parent can refresh data. */
  onSuccess?: (info: { stripeRefundId: string }) => void;
}

function centsToEuro(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function StripeRefundModal({ target, onClose, onSuccess }: StripeRefundModalProps) {
  const remainingCents = Math.max(0, target.paidAmountCents - target.refundedAmountCents);
  const defaultEuros = (remainingCents / 100).toFixed(2);
  const [amountInput, setAmountInput] = useState<string>(defaultEuros);
  const [reason, setReason] = useState<string>("");
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [pending, setPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ stripeRefundId: string; refundedAmountCents: number; full: boolean } | null>(null);

  const parsedEuros = Number.parseFloat(amountInput.replace(",", "."));
  const amountCents = Number.isFinite(parsedEuros) ? Math.round(parsedEuros * 100) : 0;
  const amountValid = amountCents > 0 && amountCents <= remainingCents;
  const reasonValid = reason.trim().length > 0;
  const canSubmit = amountValid && reasonValid && confirmed && !pending && !successInfo;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    try {
      const result = await issueStripeRefundAction({
        kind: target.kind,
        id: target.id,
        amountCents,
        reason: reason.trim(),
      });
      if (result.success && result.stripeRefundId) {
        setSuccessInfo({
          stripeRefundId: result.stripeRefundId,
          refundedAmountCents: result.refundedAmountCents ?? amountCents,
          full: result.fullRefund ?? false,
        });
        onSuccess?.({ stripeRefundId: result.stripeRefundId });
      } else {
        setError(result.error ?? "Stripe could not create the refund.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe could not create the refund.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="rounded-full bg-red-50 p-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Issue Stripe refund</h3>
            <p className="mt-1 text-sm text-gray-500">
              This will refund the customer through Stripe. This cannot be undone from BPM.
            </p>
          </div>
        </div>

        {successInfo ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <p className="font-medium">Stripe refund created successfully.</p>
              <p className="mt-1 text-xs text-green-700">
                Refunded {centsToEuro(successInfo.refundedAmountCents)}{successInfo.full ? " (full refund)" : ""}.
              </p>
              <p className="mt-1 break-all text-[11px] text-green-700/80">
                Refund id: <span className="font-mono">{successInfo.stripeRefundId}</span>
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <p>
                <span className="font-medium text-gray-700">Transaction:</span> {target.label}
              </p>
              <p className="mt-0.5">
                <span className="font-medium text-gray-700">Paid:</span> {centsToEuro(target.paidAmountCents)}
                {target.refundedAmountCents > 0 && (
                  <span className="ml-2 text-gray-500">
                    (already refunded: {centsToEuro(target.refundedAmountCents)})
                  </span>
                )}
              </p>
              <p className="mt-0.5">
                <span className="font-medium text-gray-700">Remaining refundable:</span> {centsToEuro(remainingCents)}
              </p>
            </div>

            <div>
              <label htmlFor="stripe-refund-amount" className="block text-xs font-medium text-gray-700">
                Refund amount (€)
              </label>
              <input
                id="stripe-refund-amount"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                disabled={pending}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500 disabled:opacity-50"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Defaults to the full remaining amount. Enter a smaller value for a partial refund.
              </p>
              {!amountValid && amountInput && (
                <p className="mt-1 text-[11px] text-red-500">
                  Amount must be between {centsToEuro(1)} and {centsToEuro(remainingCents)}.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="stripe-refund-reason" className="block text-xs font-medium text-gray-700">
                Reason
              </label>
              <textarea
                id="stripe-refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={pending}
                rows={2}
                placeholder="Example: Customer cancelled — refunded to original card."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500 disabled:opacity-50"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={pending}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
              />
              <span>I understand this will issue a real refund through Stripe.</span>
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Issue Stripe refund
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
