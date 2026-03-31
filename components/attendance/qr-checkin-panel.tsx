"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  QrCode,
  User,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Keyboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { QrScanner } from "./qr-scanner";
import { formatTime } from "@/lib/utils";
import {
  lookupStudentByQrAction,
  qrCheckInBookingAction,
  type QrLookupResult,
  type QrStudentBooking,
} from "@/lib/actions/qr-checkin";
import { isValidStudentQrToken } from "@/lib/domain/checkin-token";

type InputMode = "camera" | "manual";

export function QrCheckInPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("camera");
  const [manualToken, setManualToken] = useState("");
  const [isLooking, startLookup] = useTransition();
  const [lookupResult, setLookupResult] = useState<QrLookupResult | null>(null);
  const [checkInResults, setCheckInResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [isCheckingIn, startCheckIn] = useTransition();

  const doLookup = useCallback(
    (token: string) => {
      if (!isValidStudentQrToken(token)) {
        setLookupResult({ success: false, error: "Not a valid student QR code. Expected a bpm-… code." });
        return;
      }
      startLookup(async () => {
        const res = await lookupStudentByQrAction(token);
        setLookupResult(res);
        setCheckInResults(new Map());
      });
    },
    []
  );

  function handleScan(code: string) {
    doLookup(code);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualToken.trim()) {
      doLookup(manualToken.trim());
    }
  }

  function handleCheckIn(bookingId: string) {
    startCheckIn(async () => {
      const res = await qrCheckInBookingAction(bookingId);
      setCheckInResults((prev) => {
        const next = new Map(prev);
        next.set(bookingId, {
          success: res.success,
          message: res.success ? `Checked in for ${res.classTitle}` : res.error ?? "Check-in failed",
        });
        return next;
      });
      if (res.success) {
        router.refresh();
      }
    });
  }

  function resetScan() {
    setLookupResult(null);
    setCheckInResults(new Map());
    setManualToken("");
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setMode("camera"); resetScan(); }}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            mode === "camera"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <QrCode className="h-4 w-4" />
          Camera
        </button>
        <button
          type="button"
          onClick={() => { setMode("manual"); resetScan(); }}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            mode === "manual"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Keyboard className="h-4 w-4" />
          Manual
        </button>
      </div>

      {/* Scanner or manual entry */}
      {mode === "camera" ? (
        <div className="space-y-3">
          <QrScanner onScan={handleScan} active={mode === "camera" && !lookupResult} />
          <p className="text-center text-xs text-gray-500">
            Point camera at student&apos;s QR code
          </p>
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="space-y-2">
          <input
            type="text"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="Enter student QR token (bpm-…)"
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm font-mono placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={isLooking || !manualToken.trim()}>
            {isLooking ? "Looking up…" : "Look Up Student"}
          </Button>
        </form>
      )}

      {/* Loading state */}
      {isLooking && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-center">
          <p className="text-sm text-indigo-700 animate-pulse">Looking up student…</p>
        </div>
      )}

      {/* Lookup result */}
      {lookupResult && !isLooking && (
        <div className="space-y-3">
          {!lookupResult.success ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <p className="text-sm font-medium text-red-800">{lookupResult.error}</p>
              </div>
              <Button size="sm" variant="outline" onClick={resetScan} className="w-full">
                Scan Again
              </Button>
            </div>
          ) : (
            <>
              {/* Student info */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                    <User className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-gray-900">{lookupResult.student!.name}</p>
                    <p className="text-sm text-gray-500 truncate">{lookupResult.student!.email}</p>
                  </div>
                </div>

                {/* Status badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {lookupResult.hasActiveEntitlement ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                      <CreditCard className="h-3 w-3" /> Active entitlement
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                      <CreditCard className="h-3 w-3" /> No active entitlement
                    </span>
                  )}
                  {lookupResult.paymentPending && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                      <AlertTriangle className="h-3 w-3" /> Payment pending
                    </span>
                  )}
                </div>
              </div>

              {/* Today's bookings */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  Today&apos;s Bookings ({lookupResult.todayBookings!.length})
                </h3>

                {lookupResult.todayBookings!.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
                    <p className="text-sm text-gray-500">No bookings for today</p>
                  </div>
                ) : (
                  lookupResult.todayBookings!.map((b) => (
                    <BookingCheckInCard
                      key={b.bookingId}
                      booking={b}
                      result={checkInResults.get(b.bookingId)}
                      onCheckIn={() => handleCheckIn(b.bookingId)}
                      isPending={isCheckingIn}
                    />
                  ))
                )}
              </div>

              <Button variant="outline" onClick={resetScan} className="w-full">
                Scan Next Student
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BookingCheckInCard({
  booking: b,
  result,
  onCheckIn,
  isPending,
}: {
  booking: QrStudentBooking;
  result?: { success: boolean; message: string };
  onCheckIn: () => void;
  isPending: boolean;
}) {
  const checkedIn = b.isCheckedIn || result?.success;

  return (
    <div
      className={`rounded-xl border p-3 shadow-sm space-y-2 ${
        checkedIn
          ? "border-green-200 bg-green-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">{b.classTitle}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500 mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(b.startTime)} – {formatTime(b.endTime)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {b.location}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          {b.danceRole && <StatusBadge status={b.danceRole} />}
        </div>
      </div>

      {b.subscriptionName && (
        <p className="text-xs text-gray-500">
          Using: <span className="font-medium text-gray-700">{b.subscriptionName}</span>
        </p>
      )}

      {result && !result.success && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {result.message}
        </div>
      )}

      {checkedIn ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-800">
            {result?.success ? result.message : "Checked in"}
          </span>
        </div>
      ) : (
        <Button
          onClick={onCheckIn}
          disabled={isPending || !b.canCheckIn}
          className="w-full"
        >
          {isPending ? "Checking in…" : "Check In"}
        </Button>
      )}
    </div>
  );
}
