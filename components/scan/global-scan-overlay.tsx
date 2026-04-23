"use client";

import { useCallback, useState } from "react";
import {
  User,
  Ticket,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GlobalScanResult } from "@/lib/domain/scan-receiver";
import {
  lookupStudentByIdAction,
  type QrLookupResult,
} from "@/lib/actions/qr-checkin";
import { StudentScanPanel } from "./student-scan-panel";

interface GlobalScanOverlayProps {
  /** The current scanned result to display. Null hides the dialog. */
  result: GlobalScanResult | null;
  /** Close the dialog (keep scan history intact). */
  onClose: () => void;
  /**
   * Clear the current result and re-arm the receiver for a new scan.
   * Typically wired to `setScanResult(null)` in the receiver.
   */
  onNextScan: () => void;
  /**
   * Number of scans that arrived while this modal was open and were
   * intentionally suppressed. Rendered as a small indicator on the
   * Next-scan button so the admin knows the mobile user tried again.
   */
  suppressedCount?: number;
}

export function GlobalScanOverlay({
  result,
  onClose,
  onNextScan,
  suppressedCount = 0,
}: GlobalScanOverlayProps) {
  const open = !!result;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result?.type === "student" && (
              <>
                <User className="h-5 w-5 text-bpm-600" />
                Student Scanned
              </>
            )}
            {result?.type === "event_guest" && (
              <>
                <Ticket className="h-5 w-5 text-purple-600" />
                Event Guest Scanned
              </>
            )}
            {result?.type === "error" && (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Scan Error
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          {result?.type === "student" && <StudentResultBody result={result.data} />}
          {result?.type === "event_guest" && (
            <EventGuestResultBody result={result.data} />
          )}
          {result?.type === "error" && <ErrorResult message={result.message} />}
        </DialogBody>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
          <Button
            onClick={onNextScan}
            className="w-full sm:w-auto bg-bpm-600 hover:bg-bpm-700 text-white"
          >
            <ArrowRight className="h-4 w-4 mr-1.5" />
            Next scan
            {suppressedCount > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-bold">
                +{suppressedCount}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Student result body ────────────────────────────────────────

function StudentResultBody({ result }: { result: QrLookupResult }) {
  const studentId = result.student?.id;
  const [currentResult, setCurrentResult] = useState(result);

  // Wrap the refresh action so the panel can call it by id without ever
  // needing the underlying QR token.
  const refresh = useCallback(async (): Promise<QrLookupResult | null> => {
    if (!studentId) return null;
    const next = await lookupStudentByIdAction(studentId);
    setCurrentResult(next);
    return next;
  }, [studentId]);

  return <StudentScanPanel result={currentResult} onRefresh={refresh} compactHeader />;
}

// ── Event guest body (rich, reuses the event-guest details from qr-checkin) ──

function EventGuestResultBody({
  result,
}: {
  result: Extract<GlobalScanResult, { type: "event_guest" }>["data"];
}) {
  if (!result.success || !result.purchase) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">
            {result.error ?? "Event guest lookup failed"}
          </p>
        </div>
      </div>
    );
  }

  const p = result.purchase;
  const isPaid = p.paymentStatus === "paid";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-100">
            <Ticket className="h-6 w-6 text-purple-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-gray-900 truncate">
              {p.guestName}
            </p>
            <p className="text-sm text-gray-500 truncate">{p.guestEmail}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              isPaid
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {p.paymentStatus}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <Field label="Event" value={p.eventTitle} icon={<CalendarDays className="h-3.5 w-3.5" />} />
          <Field label="Product" value={p.productName} />
          <Field
            label="Payment"
            value={p.paymentMethod === "stripe" ? "Card (Stripe)" : "Pay at reception"}
          />
          <Field
            label="Purchased"
            value={new Date(p.purchasedAt).toLocaleDateString("en-IE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          />
          {p.guestPhone && <Field label="Phone" value={p.guestPhone} />}
          {p.inclusionSummary && (
            <div className="sm:col-span-2">
              <Field label="Includes" value={p.inclusionSummary} />
            </div>
          )}
        </div>

        {isPaid ? (
          <div className="rounded-lg bg-green-50 border border-green-100 p-3 flex items-start gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-green-800 font-medium">
              Payment confirmed — guest is cleared for entry.
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 font-medium">
              Payment pending — collect payment before granting entry.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-gray-500 flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}

function ErrorResult({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-800">Scan could not be processed</p>
          <p className="mt-0.5 text-xs text-amber-700">{message}</p>
          <p className="mt-2 text-[11px] text-amber-700/80 inline-flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Press “Next scan” to scan a different code from the phone.
          </p>
        </div>
      </div>
    </div>
  );
}
