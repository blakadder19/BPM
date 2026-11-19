"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { sendGuestReceiptAction } from "@/lib/actions/receipts";

interface Props {
  purchaseId: string;
  buyerName: string;
  /** Guest email stored on the purchase; null for student purchases. */
  guestEmail: string | null;
  isGuest: boolean;
  hasActiveLink: boolean;
}

/** "View receipt" plus, for guest purchases, "Send / Resend receipt". Rendered only for eligible purchases. */
export function PurchaseReceiptActions({ purchaseId, buyerName, guestEmail, isGuest, hasActiveLink }: Props) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendGuestReceiptAction({ purchaseId });
        if (res.success) {
          setNotice(res.message);
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch {
        setError("Unexpected error. Nothing was sent.");
      }
    });
  }

  const sendLabel = hasActiveLink ? "Resend receipt" : "Send receipt";

  return (
    <>
      <a
        href={`/api/receipts/staff/event/${purchaseId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline inline-flex items-center gap-0.5"
        title="Open the Payment Receipt PDF"
      >
        <FileText className="h-3 w-3" /> View receipt
      </a>
      {isGuest && guestEmail && (
        <button
          onClick={() => { setError(null); setNotice(null); setConfirmOpen(true); }}
          className="text-xs font-medium text-bpm-600 hover:underline"
          title={`Email a receipt download link to ${guestEmail}`}
        >
          {sendLabel}
        </button>
      )}

      {confirmOpen && (
        <Dialog open={confirmOpen} onClose={() => !pending && setConfirmOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{sendLabel}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              {notice ? (
                <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-3">
                    Email a Payment Receipt download link for <span className="font-medium">{buyerName}</span>&apos;s purchase to
                    the email on the purchase: <span className="font-medium">{guestEmail}</span>.
                  </p>
                  {hasActiveLink && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 mb-3">
                      The receipt link the customer already has will stop working and be replaced by the new one.
                      If the email cannot be sent, the existing link is kept.
                    </div>
                  )}
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </>
              )}
            </DialogBody>
            <DialogFooter>
              {notice ? (
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="px-3 py-1.5 text-sm rounded-md bg-bpm-600 text-white hover:bg-bpm-700"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmOpen(false)}
                    className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={send}
                    disabled={pending}
                    className="px-3 py-1.5 text-sm rounded-md bg-bpm-600 text-white hover:bg-bpm-700 disabled:opacity-50"
                  >
                    {pending ? "Sending…" : sendLabel}
                  </button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
