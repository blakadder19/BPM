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
  ShoppingCart,
  Plus,
  ArrowLeft,
  X,
  Banknote,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { QrScanner } from "./qr-scanner";
import { formatTime, formatDate } from "@/lib/utils";
import {
  lookupStudentByQrAction,
  qrCheckInBookingAction,
  qrWalkInCheckInAction,
  qrMarkPaidAndCheckInAction,
  qrMarkPaidAndWalkInAction,
  qrSellDropInAndCheckInAction,
  qrMarkSubscriptionPaidAction,
  type QrLookupResult,
  type QrStudentBooking,
  type QrEntitlementDetail,
  type QrTodayClass,
} from "@/lib/actions/qr-checkin";
import { isValidStudentQrToken } from "@/lib/domain/checkin-token";

type InputMode = "camera" | "manual";

type PaymentConfirmation = {
  type: "booking" | "walkin";
  bookingId?: string;
  classId?: string;
  studentId?: string;
  subscriptionId: string;
  subscriptionName: string;
  classTitle: string;
};

type NoEntitlementTarget = {
  classId: string;
  classTitle: string;
  styleName: string | null;
};

type PaymentMethod = "cash" | "revolut";

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function QrCheckInPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("camera");
  const [manualToken, setManualToken] = useState("");
  const [isLooking, startLookup] = useTransition();
  const [lookupResult, setLookupResult] = useState<QrLookupResult | null>(null);
  const [checkInResults, setCheckInResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [isCheckingIn, startCheckIn] = useTransition();
  const [paymentConfirm, setPaymentConfirm] = useState<PaymentConfirmation | null>(null);
  const [noEntTarget, setNoEntTarget] = useState<NoEntitlementTarget | null>(null);
  const [selectedPayMethod, setSelectedPayMethod] = useState<PaymentMethod>("cash");

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

  function handleCheckIn(bookingId: string, entitlementPaymentStatus?: string, subscriptionId?: string, subscriptionName?: string, classTitle?: string) {
    if (entitlementPaymentStatus === "pending" && subscriptionId) {
      setPaymentConfirm({
        type: "booking",
        bookingId,
        subscriptionId,
        subscriptionName: subscriptionName ?? "Unknown plan",
        classTitle: classTitle ?? "class",
      });
      return;
    }
    doCheckIn(bookingId);
  }

  function doCheckIn(bookingId: string) {
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
      if (res.success) router.refresh();
    });
  }

  function handleWalkIn(cls: QrTodayClass) {
    if (!cls.hasEntitlement) {
      setNoEntTarget({
        classId: cls.classId,
        classTitle: cls.classTitle,
        styleName: cls.styleName,
      });
      return;
    }
    if (cls.paymentStatus === "pending" && cls.matchingSubscriptionId) {
      setPaymentConfirm({
        type: "walkin",
        classId: cls.classId,
        studentId: lookupResult?.student?.id,
        subscriptionId: cls.matchingSubscriptionId,
        subscriptionName: cls.matchingSubscriptionName ?? "Unknown plan",
        classTitle: cls.classTitle,
      });
      return;
    }
    doWalkIn(cls.classId, lookupResult?.student?.id ?? "", cls.matchingSubscriptionId ?? "");
  }

  function handleSellDropInAndCheckIn() {
    if (!noEntTarget || !lookupResult?.student?.id) return;
    const target = noEntTarget;
    setNoEntTarget(null);
    const key = `walkin-${target.classId}`;
    startCheckIn(async () => {
      const res = await qrSellDropInAndCheckInAction(lookupResult.student!.id, target.classId);
      setCheckInResults((prev) => {
        const next = new Map(prev);
        next.set(key, {
          success: res.success,
          message: res.success ? `Drop-in sold and checked in for ${res.classTitle}` : res.error ?? "Failed",
        });
        return next;
      });
      if (res.success) router.refresh();
    });
  }

  function handleGoToAddProduct() {
    if (!lookupResult?.student?.id || !noEntTarget) return;
    const params = new URLSearchParams({
      highlight: lookupResult.student.id,
      action: "add-subscription",
    });
    if (noEntTarget.styleName) params.set("style", noEntTarget.styleName);
    if (noEntTarget.classId) params.set("classId", noEntTarget.classId);
    setNoEntTarget(null);
    router.push(`/students?${params.toString()}`);
  }

  function doWalkIn(classId: string, studentId: string, subscriptionId: string) {
    const key = `walkin-${classId}`;
    startCheckIn(async () => {
      const res = await qrWalkInCheckInAction(studentId, classId, subscriptionId);
      setCheckInResults((prev) => {
        const next = new Map(prev);
        next.set(key, {
          success: res.success,
          message: res.success ? `Checked in for ${res.classTitle}` : res.error ?? "Check-in failed",
        });
        return next;
      });
      if (res.success) router.refresh();
    });
  }

  function handlePaymentConfirmMarkPaid() {
    if (!paymentConfirm) return;
    const pc = paymentConfirm;
    const method = selectedPayMethod;
    setPaymentConfirm(null);
    setSelectedPayMethod("cash");
    startCheckIn(async () => {
      let res;
      if (pc.type === "booking" && pc.bookingId) {
        res = await qrMarkPaidAndCheckInAction(pc.bookingId, pc.subscriptionId, method);
      } else if (pc.type === "walkin" && pc.classId && pc.studentId) {
        res = await qrMarkPaidAndWalkInAction(pc.studentId, pc.classId, pc.subscriptionId, method);
      } else {
        return;
      }
      const key = pc.type === "booking" ? pc.bookingId! : `walkin-${pc.classId}`;
      setCheckInResults((prev) => {
        const next = new Map(prev);
        next.set(key, {
          success: res.success,
          message: res.success ? `Paid (${method}) and checked in for ${res.classTitle}` : res.error ?? "Failed",
        });
        return next;
      });
      if (res.success) router.refresh();
    });
  }

  function handlePaymentConfirmKeepPending() {
    if (!paymentConfirm) return;
    const pc = paymentConfirm;
    setPaymentConfirm(null);
    if (pc.type === "booking" && pc.bookingId) {
      doCheckIn(pc.bookingId);
    } else if (pc.type === "walkin" && pc.classId && pc.studentId) {
      doWalkIn(pc.classId, pc.studentId, pc.subscriptionId);
    }
  }

  function handleEntitlementMarkPaid(subscriptionId: string, method: PaymentMethod) {
    startCheckIn(async () => {
      const res = await qrMarkSubscriptionPaidAction(subscriptionId, method);
      if (res.success) {
        const token = lookupResult?.student?.id;
        if (token) router.refresh();
        setLookupResult((prev) => {
          if (!prev) return prev;
          const patchEnt = (e: QrEntitlementDetail): QrEntitlementDetail =>
            e.subscriptionId === subscriptionId ? { ...e, paymentStatus: "paid" } : e;
          return {
            ...prev,
            entitlements: prev.entitlements?.map(patchEnt),
            todayBookings: prev.todayBookings?.map((b) => ({
              ...b,
              entitlement: b.entitlement ? patchEnt(b.entitlement) : b.entitlement,
            })),
            todayClasses: prev.todayClasses?.map((c) =>
              c.matchingSubscriptionId === subscriptionId ? { ...c, paymentStatus: "paid" } : c
            ),
            paymentPending: prev.entitlements?.filter((e) => e.subscriptionId !== subscriptionId).some((e) => e.paymentStatus === "pending") ?? false,
          };
        });
      }
    });
  }

  function resetScan() {
    setLookupResult(null);
    setCheckInResults(new Map());
    setManualToken("");
    setPaymentConfirm(null);
    setNoEntTarget(null);
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

                {/* Entitlement details */}
                {lookupResult.entitlements && lookupResult.entitlements.length > 0 && (
                  <div className="space-y-1.5 border-t border-gray-100 pt-3">
                    {lookupResult.entitlements.map((ent) => (
                      <EntitlementRow
                        key={ent.subscriptionId}
                        ent={ent}
                        onMarkPaid={handleEntitlementMarkPaid}
                      />
                    ))}
                  </div>
                )}

                {/* Recent expired entitlement when no active */}
                {!lookupResult.hasActiveEntitlement && lookupResult.recentExpiredEntitlement && (
                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Last Entitlement</p>
                    <ExpiredEntitlementRow ent={lookupResult.recentExpiredEntitlement} />
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-xs text-amber-800">
                        This student has no active entitlement for booking or check-in.
                      </p>
                    </div>
                  </div>
                )}

                {!lookupResult.hasActiveEntitlement && !lookupResult.recentExpiredEntitlement && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-xs text-amber-800">
                        This student has no entitlement history. They need to purchase a membership or pass.
                      </p>
                    </div>
                  </div>
                )}
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
                      onCheckIn={() => handleCheckIn(
                        b.bookingId,
                        b.entitlement?.paymentStatus,
                        b.entitlement?.subscriptionId,
                        b.entitlement?.productName,
                        b.classTitle,
                      )}
                      isPending={isCheckingIn}
                    />
                  ))
                )}
              </div>

              {/* Today's classes (walk-in / no-entitlement) */}
              {lookupResult.todayClasses && lookupResult.todayClasses.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Today&apos;s Classes ({lookupResult.todayClasses.length})
                  </h3>
                  {lookupResult.todayBookings!.length === 0 && (
                    <p className="text-xs text-gray-500">
                      No bookings found. Select a class for walk-in check-in.
                    </p>
                  )}
                  {lookupResult.todayClasses.map((cls) => (
                    <TodayClassCard
                      key={cls.classId}
                      cls={cls}
                      result={checkInResults.get(`walkin-${cls.classId}`)}
                      onAction={() => handleWalkIn(cls)}
                      isPending={isCheckingIn}
                    />
                  ))}
                </div>
              )}

              {/* No-entitlement overlay modal */}
              {noEntTarget && (
                <Overlay onClose={() => setNoEntTarget(null)}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                    <p className="text-sm font-semibold text-red-900">
                      No valid product found
                    </p>
                  </div>
                  <p className="text-sm text-gray-700">
                    This student has no valid entitlement for{" "}
                    <span className="font-medium">{noEntTarget.classTitle}</span>.
                    {noEntTarget.styleName && (
                      <> Style: <span className="font-medium">{noEntTarget.styleName}</span>.</>
                    )}
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={handleSellDropInAndCheckIn}
                      disabled={isCheckingIn}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <ShoppingCart className="h-4 w-4 mr-1.5" />
                      {isCheckingIn ? "Processing…" : "Sell a drop-in and check in"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleGoToAddProduct}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add another product
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setNoEntTarget(null)}
                      className="w-full text-gray-500"
                    >
                      <ArrowLeft className="h-4 w-4 mr-1.5" />
                      Go back
                    </Button>
                  </div>
                </Overlay>
              )}

              {/* Payment confirmation overlay modal */}
              {paymentConfirm && (
                <Overlay onClose={() => setPaymentConfirm(null)}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-sm font-semibold text-amber-900">
                      Payment not confirmed
                    </p>
                  </div>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">{paymentConfirm.subscriptionName}</span> is not paid yet.
                    Choose how payment was collected for <span className="font-medium">{paymentConfirm.classTitle}</span>.
                  </p>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Payment method</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPayMethod("cash")}
                        className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors ${
                          selectedPayMethod === "cash"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <Banknote className="h-4 w-4" />
                        Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPayMethod("revolut")}
                        className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors ${
                          selectedPayMethod === "revolut"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <Smartphone className="h-4 w-4" />
                        Revolut
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      onClick={handlePaymentConfirmMarkPaid}
                      disabled={isCheckingIn}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isCheckingIn ? "Processing…" : `Mark as paid (${selectedPayMethod}) and check in`}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handlePaymentConfirmKeepPending}
                      disabled={isCheckingIn}
                      className="w-full"
                    >
                      Keep as pending and check in anyway
                    </Button>
                  </div>
                </Overlay>
              )}

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

      {b.entitlement ? (
        <EntitlementRow ent={b.entitlement} compact />
      ) : b.subscriptionName ? (
        <p className="text-xs text-gray-500">
          Using: <span className="font-medium text-gray-700">{b.subscriptionName}</span>
        </p>
      ) : null}

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

function TodayClassCard({
  cls,
  result,
  onAction,
  isPending,
}: {
  cls: QrTodayClass;
  result?: { success: boolean; message: string };
  onAction: () => void;
  isPending: boolean;
}) {
  const done = result?.success;
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm space-y-2 ${
        done
          ? "border-green-200 bg-green-50"
          : cls.hasEntitlement
            ? "border-gray-200 bg-white"
            : "border-dashed border-gray-300 bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">{cls.classTitle}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500 mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime(cls.startTime)} – {formatTime(cls.endTime)}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {cls.location}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {cls.hasEntitlement ? (
            cls.paymentStatus === "pending" ? (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
                Payment pending
              </span>
            ) : null
          ) : (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700">
              No product
            </span>
          )}
        </div>
      </div>

      {cls.hasEntitlement && cls.matchingSubscriptionName && (
        <p className="text-xs text-gray-500">
          Using: <span className="font-medium text-gray-700">{cls.matchingSubscriptionName}</span>
        </p>
      )}

      {result && !result.success && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {result.message}
        </div>
      )}

      {done ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-100 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-green-800">
            {result?.message ?? "Checked in"}
          </span>
        </div>
      ) : cls.hasEntitlement && cls.paymentStatus === "pending" ? (
        <Button
          onClick={onAction}
          disabled={isPending}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        >
          <Banknote className="h-4 w-4 mr-1.5" />
          {isPending ? "Processing…" : "Confirm payment and check in"}
        </Button>
      ) : (
        <Button
          onClick={onAction}
          disabled={isPending}
          variant={cls.hasEntitlement ? "primary" : "outline"}
          className="w-full"
        >
          {isPending
            ? "Processing…"
            : cls.hasEntitlement
              ? "Walk-in Check In"
              : "Check In (no product)…"}
        </Button>
      )}
    </div>
  );
}

function formatBalance(ent: QrEntitlementDetail): string {
  if (ent.totalCredits != null && ent.remainingCredits != null) {
    const used = ent.totalCredits - ent.remainingCredits;
    return `${used} of ${ent.totalCredits} credits used · ${ent.remainingCredits} left`;
  }
  if (ent.classesPerTerm != null) {
    return `${ent.classesUsed} of ${ent.classesPerTerm} used · ${ent.classesPerTerm - ent.classesUsed} left`;
  }
  if (ent.remainingCredits != null) {
    return `${ent.remainingCredits} credits remaining`;
  }
  return "";
}

const PAYMENT_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-100 text-green-700" },
  complimentary: { label: "Complimentary", className: "bg-green-100 text-green-700" },
  pending: { label: "Payment pending", className: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Payment cancelled", className: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", className: "bg-red-100 text-red-700" },
  waived: { label: "Waived", className: "bg-gray-200 text-gray-600" },
};

function EntitlementRow({
  ent,
  compact,
  onMarkPaid,
}: {
  ent: QrEntitlementDetail;
  compact?: boolean;
  onMarkPaid?: (subscriptionId: string, method: PaymentMethod) => void;
}) {
  const [showPay, setShowPay] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const balance = formatBalance(ent);
  const badge = PAYMENT_BADGE[ent.paymentStatus] ?? null;

  return (
    <div className={`rounded-lg bg-gray-50 px-3 py-2 text-xs ${compact ? "" : "border border-gray-100"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-gray-800">{ent.productName}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
            {ent.productType.replace("_", " ")}
          </span>
          {badge && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </div>
      </div>
      {(balance || ent.termName) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-gray-500">
          {balance && <span>{balance}</span>}
          {ent.termName && <span>Term: {ent.termName}</span>}
        </div>
      )}
      {ent.paymentStatus === "pending" && onMarkPaid && !showPay && (
        <button
          type="button"
          onClick={() => setShowPay(true)}
          className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-amber-700 transition-colors"
        >
          <Banknote className="h-3 w-3" />
          Mark as paid
        </button>
      )}
      {showPay && onMarkPaid && (
        <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setMethod("cash")}
              className={`flex items-center justify-center gap-1 rounded border-2 px-2 py-1.5 text-[10px] font-medium transition-colors ${
                method === "cash"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <Banknote className="h-3 w-3" /> Cash
            </button>
            <button
              type="button"
              onClick={() => setMethod("revolut")}
              className={`flex items-center justify-center gap-1 rounded border-2 px-2 py-1.5 text-[10px] font-medium transition-colors ${
                method === "revolut"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <Smartphone className="h-3 w-3" /> Revolut
            </button>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                onMarkPaid(ent.subscriptionId, method);
                setShowPay(false);
              }}
              className="flex-1 rounded bg-emerald-600 px-2 py-1.5 text-[10px] font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              Confirm ({method})
            </button>
            <button
              type="button"
              onClick={() => setShowPay(false)}
              className="rounded px-2 py-1.5 text-[10px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  expired: { label: "Expired", className: "bg-red-100 text-red-700" },
  exhausted: { label: "Exhausted", className: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Cancelled", className: "bg-gray-200 text-gray-600" },
};

function ExpiredEntitlementRow({ ent }: { ent: QrEntitlementDetail }) {
  const balance = formatBalance(ent);
  const statusBadge = STATUS_LABELS[ent.status] ?? { label: ent.status, className: "bg-gray-200 text-gray-600" };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-gray-800">{ent.productName}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 uppercase">
            {ent.productType.replace("_", " ")}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-gray-500">
        {balance && <span>{balance}</span>}
        {ent.termName && <span>Term: {ent.termName}</span>}
        {ent.validUntil && <span>Ended: {formatDate(ent.validUntil)}</span>}
      </div>
    </div>
  );
}
