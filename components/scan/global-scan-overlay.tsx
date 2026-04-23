"use client";

import { useRouter } from "next/navigation";
import {
  User,
  Ticket,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import type { GlobalScanResult } from "@/lib/domain/scan-receiver";

interface GlobalScanOverlayProps {
  result: GlobalScanResult;
  onClose: () => void;
}

export function GlobalScanOverlay({ result, onClose }: GlobalScanOverlayProps) {
  const router = useRouter();

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.type === "student" && (
              <>
                <User className="h-5 w-5 text-bpm-600" />
                Student Scanned
              </>
            )}
            {result.type === "event_guest" && (
              <>
                <Ticket className="h-5 w-5 text-purple-600" />
                Event Guest Scanned
              </>
            )}
            {result.type === "error" && (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Scan Error
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            {result.type === "student" && <StudentResult result={result} onClose={onClose} />}
            {result.type === "event_guest" && <EventGuestResult result={result} onClose={onClose} router={router} />}
            {result.type === "error" && <ErrorResult message={result.message} />}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function StudentResult({
  result,
  onClose,
}: {
  result: Extract<GlobalScanResult, { type: "student" }>;
  onClose: () => void;
}) {
  const { data } = result;

  if (!data.success) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm font-medium text-red-700">{data.error}</p>
      </div>
    );
  }

  const student = data.student!;
  const bookingCount = data.todayBookings?.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bpm-100 text-bpm-600">
            <User className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                window.open(`/students?highlight=${student.id}`, "_blank");
              }}
              className="text-lg font-semibold text-bpm-600 hover:text-bpm-700 hover:underline text-left"
            >
              {student.name}
            </button>
            <p className="text-sm text-gray-500 truncate">{student.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.hasActiveEntitlement ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
              <CreditCard className="h-3 w-3" /> Active entitlement
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              <CreditCard className="h-3 w-3" /> No active entitlement
            </span>
          )}
          {data.paymentPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3" /> Payment pending
            </span>
          )}
          {bookingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
              <CheckCircle2 className="h-3 w-3" /> {bookingCount} booking{bookingCount !== 1 ? "s" : ""} today
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function EventGuestResult({
  result,
  onClose,
  router,
}: {
  result: Extract<GlobalScanResult, { type: "event_guest" }>;
  onClose: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const { data } = result;

  if (!data.success) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
        <p className="text-sm font-medium text-red-700">{data.error}</p>
      </div>
    );
  }

  const purchase = data.purchase!;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600">
            <Ticket className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{purchase.guestName}</p>
            <p className="text-xs text-gray-500">{purchase.eventTitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span>{purchase.productName}</span>
          <span
            className={`font-medium ${
              purchase.paymentStatus === "paid" ? "text-green-600" : "text-amber-600"
            }`}
          >
            {purchase.paymentStatus}
          </span>
        </div>

        {purchase.paymentStatus === "paid" && (
          <div className="rounded-lg bg-green-50 border border-green-100 p-2.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-xs text-green-800 font-medium">Payment confirmed</p>
          </div>
        )}
        {purchase.paymentStatus === "pending" && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 font-medium">Payment pending — collect before entry</p>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          onClose();
          router.push(`/events/${purchase.eventId}/operations`);
        }}
        className="w-full rounded-lg bg-purple-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-purple-700 transition-colors text-center"
      >
        Event operations
      </button>
    </div>
  );
}

function ErrorResult({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
      <p className="text-sm font-medium text-amber-700">{message}</p>
    </div>
  );
}
