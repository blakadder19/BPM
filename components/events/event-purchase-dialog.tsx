"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { createEventPurchaseAction } from "@/lib/actions/event-purchase";
import { createEventStripeCheckoutAction } from "@/lib/actions/stripe-checkout";
import type { MockEventProduct, MockEventSession } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onClose: () => void;
  product: MockEventProduct;
  sessions: MockEventSession[];
  stripeEnabled: boolean;
}

function centsToEuros(c: number) {
  return `€${(c / 100).toFixed(2)}`;
}

const INCLUSION_DESCRIPTIONS: Record<string, string> = {
  all_sessions: "Access to all event sessions",
  all_workshops: "Access to all workshops",
  socials_only: "Access to socials only",
};

export function EventPurchaseDialog({ open, onClose, product, sessions, stripeEnabled }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "manual">(stripeEnabled ? "stripe" : "manual");

  function getIncludedSessions(): MockEventSession[] {
    if (product.inclusionRule === "all_sessions") return sessions;
    if (product.inclusionRule === "all_workshops") return sessions.filter((s) => s.sessionType === "workshop");
    if (product.inclusionRule === "socials_only") return sessions.filter((s) => s.sessionType === "social");
    if (product.inclusionRule === "selected_sessions" && product.includedSessionIds) {
      return sessions.filter((s) => product.includedSessionIds!.includes(s.id));
    }
    return [];
  }

  const included = getIncludedSessions();

  function handlePurchase() {
    setError(null);
    startTransition(async () => {
      if (paymentMethod === "stripe") {
        const res = await createEventStripeCheckoutAction({
          eventProductId: product.id,
          eventId: product.eventId,
          eventProductName: product.name,
          eventProductDescription: product.description,
          priceCents: product.priceCents,
        });
        if (res.success && res.url) {
          window.location.href = res.url;
        } else {
          setError(res.error ?? "Could not start payment.");
        }
      } else {
        const res = await createEventPurchaseAction({
          eventProductId: product.id,
          eventId: product.eventId,
        });
        if (res.success) {
          setSuccess(true);
          setTimeout(() => { router.refresh(); onClose(); }, 1500);
        } else {
          setError(res.error ?? "Something went wrong.");
        }
      }
    });
  }

  function handleClose() {
    setError(null);
    setSuccess(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Purchase {product.name}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="rounded-full bg-green-100 p-3">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-900">Purchase registered</p>
              <p className="text-sm text-gray-500">Please complete payment at reception.</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-gray-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{product.name}</span>
                  <span className="font-semibold text-bpm-700">{centsToEuros(product.priceCents)}</span>
                </div>
                {product.description && (
                  <p className="text-sm text-gray-500">{product.description}</p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">What&apos;s included</h4>
                {product.inclusionRule !== "selected_sessions" && INCLUSION_DESCRIPTIONS[product.inclusionRule] ? (
                  <p className="text-sm text-gray-600">{INCLUSION_DESCRIPTIONS[product.inclusionRule]}</p>
                ) : null}
                {included.length > 0 && (
                  <ul className="space-y-1 mt-1">
                    {included.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-sm text-gray-600">
                        <Check className="h-3.5 w-3.5 text-bpm-600 shrink-0" />
                        {s.title}
                        <span className="text-gray-400">({s.date} {s.startTime})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Payment method</h4>
                <div className="space-y-2">
                  {stripeEnabled && (
                    <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${paymentMethod === "stripe" ? "border-bpm-400 bg-bpm-50" : "border-gray-200"}`}>
                      <input type="radio" name="pm" checked={paymentMethod === "stripe"} onChange={() => setPaymentMethod("stripe")} className="text-bpm-600 focus:ring-bpm-500" />
                      <CreditCard className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">Pay online (card)</span>
                    </label>
                  )}
                  <label className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${paymentMethod === "manual" ? "border-bpm-400 bg-bpm-50" : "border-gray-200"}`}>
                    <input type="radio" name="pm" checked={paymentMethod === "manual"} onChange={() => setPaymentMethod("manual")} className="text-bpm-600 focus:ring-bpm-500" />
                    <Building2 className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">Pay at reception</span>
                  </label>
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </DialogBody>
        {!success && (
          <DialogFooter>
            <button type="button" onClick={handleClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              type="button"
              disabled={isPending}
              onClick={handlePurchase}
              className="rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 disabled:opacity-50"
            >
              {isPending ? "Processing…" : paymentMethod === "stripe" ? "Pay now" : "Confirm purchase"}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
