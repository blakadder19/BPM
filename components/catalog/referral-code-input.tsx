"use client";

/**
 * Phase 7 — referral-code input for the student checkout dialog.
 *
 * UX rules (from the brief):
 *  - Optional — purchase succeeds even with an empty / invalid code.
 *  - "Apply" sends the code to `previewReferralCodeAction` which
 *    validates that:
 *      * the code exists,
 *      * the purchaser is not the code owner,
 *      * this referrer hasn't already referred this purchaser.
 *  - A successful preview locks in a non-editable applied state, and
 *    the parent picks up the normalised upper-cased code via `onApplied`
 *    to submit alongside the purchase. Server re-validates on commit.
 *  - An invalid code shows a friendly inline message but does NOT
 *    block submission of the checkout — the parent simply submits
 *    without the code.
 *
 * Mirrors the proven event-promo-code widget API.
 */

import { useState, useTransition } from "react";
import { Gift, X, Check, Loader2 } from "lucide-react";
import { previewReferralCodeAction } from "@/lib/actions/referral-code";

interface AppliedReferral {
  code: string;
  referrerName: string;
}

interface Props {
  /** Purchaser id — required for self-referral / duplicate checks. */
  studentId: string;
  /** Optional purchaser email for guest-style dedup. */
  studentEmail?: string | null;
  /** Called after a successful preview with the validated code. */
  onApplied: (applied: AppliedReferral | null) => void;
  disabled?: boolean;
}

export function ReferralCodeInput({
  studentId,
  studentEmail,
  onApplied,
  disabled,
}: Props) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<AppliedReferral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApply() {
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a referral code.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await previewReferralCodeAction({
          code: trimmed,
          applicantStudentId: studentId,
          applicantEmail: studentEmail ?? null,
        });
        if (!r.ok) {
          setApplied(null);
          onApplied(null);
          setError(r.error);
          return;
        }
        const next: AppliedReferral = {
          code: r.code,
          referrerName: r.referrerName,
        };
        setApplied(next);
        onApplied(next);
      } catch (e) {
        // safeAction wraps the server side, but defence-in-depth here
        // means even a transport-level failure shows a friendly message
        // and doesn't break the checkout dialog.
        setApplied(null);
        onApplied(null);
        setError(
          e instanceof Error
            ? "Could not verify referral code. You can continue without it."
            : "Could not verify referral code.",
        );
      }
    });
  }

  function handleRemove() {
    setApplied(null);
    setError(null);
    setCode("");
    onApplied(null);
  }

  if (applied) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-800">
            <Check className="size-4" />
            <span className="font-medium">Referral code applied.</span>
            <span className="font-mono text-xs">{applied.code}</span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled || pending}
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900"
            aria-label="Remove referral code"
          >
            <X className="size-3" />
            Remove
          </button>
        </div>
        <p className="mt-1 text-xs text-emerald-800/90">
          We&apos;ll record this referral for {applied.referrerName} — admin
          reviews it before any reward is granted.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="referral-code-input"
        className="text-sm font-medium text-gray-700"
      >
        Referral code
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Gift className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <input
            id="referral-code-input"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter referral code"
            disabled={disabled || pending}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 pl-7 text-sm font-mono uppercase disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={disabled || pending || !code.trim()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Apply
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Optional — if another student referred you, enter their code here.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
