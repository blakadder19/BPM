"use client";

/**
 * Phase 5 — reusable promo-code apply widget.
 *
 * Used by both the student event purchase dialog and the public guest
 * event page. Calls `previewEventPromoCodeAction` server-side and
 * shows Original / Discount / Final breakdown, or an error message.
 *
 * After a successful apply the parent receives the validated code
 * (upper-cased) via `onApplied` and must include it when submitting
 * the purchase / Stripe checkout action. The server re-runs the same
 * pricing engine on commit, so a stale preview can never let the
 * customer pay less than the engine allows.
 */

import { useState, useTransition } from "react";
import { Tag, X, Check, Loader2 } from "lucide-react";
import { previewEventPromoCodeAction } from "@/lib/actions/event-promo-code";

interface AppliedPromo {
  code: string;
  basePriceCents: number;
  discountAmountCents: number;
  finalPriceCents: number;
}

interface Props {
  eventId: string;
  eventProductId: string;
  studentId?: string | null;
  /** Required for guest checkout when one_use_per_email is set on the rule. */
  guestEmail?: string | null;
  /** Called after a successful preview with the validated upper-cased code. */
  onApplied: (applied: AppliedPromo | null) => void;
  /** Optional baseline used to render the "before discount" amount inline. */
  basePriceCents: number;
  disabled?: boolean;
}

function centsToEuros(c: number): string {
  return `€${(c / 100).toFixed(2)}`;
}

export function PromoCodeInput({
  eventId,
  eventProductId,
  studentId,
  guestEmail,
  onApplied,
  basePriceCents,
  disabled,
}: Props) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<AppliedPromo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleApply() {
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a promo code.");
      return;
    }
    startTransition(async () => {
      const r = await previewEventPromoCodeAction({
        eventId,
        eventProductId,
        promoCode: trimmed,
        studentId: studentId ?? null,
        guestEmail: guestEmail ?? null,
      });
      if (!r.ok) {
        setApplied(null);
        onApplied(null);
        setError(r.error ?? "This promo code is not valid for this ticket.");
        return;
      }
      const next: AppliedPromo = {
        code: r.code ?? trimmed.toUpperCase(),
        basePriceCents: r.basePriceCents ?? basePriceCents,
        discountAmountCents: r.discountAmountCents ?? 0,
        finalPriceCents: r.finalPriceCents ?? basePriceCents,
      };
      setApplied(next);
      onApplied(next);
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
      <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-green-800">
            <Check className="size-4" />
            <span className="font-medium">Promo code applied:</span>
            <span className="font-mono">{applied.code}</span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled || pending}
            className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900"
            aria-label="Remove promo code"
          >
            <X className="size-3" />
            Remove
          </button>
        </div>
        <div className="mt-1 space-y-0.5 text-xs text-green-800/90">
          <div className="flex items-center justify-between">
            <span>Original</span>
            <span className="tabular-nums">
              {centsToEuros(applied.basePriceCents)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Discount</span>
            <span className="tabular-nums">
              −{centsToEuros(applied.discountAmountCents)}
            </span>
          </div>
          <div className="flex items-center justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {centsToEuros(applied.finalPriceCents)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">Promo code</label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
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
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
