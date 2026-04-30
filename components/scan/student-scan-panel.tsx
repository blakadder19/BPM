"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  User,
  Phone,
  Mail,
  AlertTriangle,
  CreditCard,
  ShoppingCart,
  Plus,
  ArrowLeft,
  Banknote,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  qrCheckInBookingAction,
  qrWalkInCheckInAction,
  qrMarkPaidAndCheckInAction,
  qrMarkPaidAndWalkInAction,
  qrSellDropInAndCheckInAction,
  qrMarkSubscriptionPaidAction,
  type QrLookupResult,
  type QrTodayClass,
} from "@/lib/actions/qr-checkin";
import {
  BookingCheckInCard,
  TodayClassCard,
  AllEntitlementsSection,
  EventPurchaseCard,
  Overlay,
} from "@/components/attendance/qr-checkin-panel";

type PaymentMethod = "cash" | "revolut";

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

export interface StudentScanPanelPermissions {
  canCheckIn: boolean;
  canCollectPayment: boolean;
}

interface StudentScanPanelProps {
  /** The resolved scan result for this student. */
  result: QrLookupResult;
  /** Re-fetch the result after an operation completes (check-in, mark paid, etc.). */
  onRefresh: () => Promise<QrLookupResult | null>;
  /**
   * When true, renders the student header more compactly (used inside the
   * global scan overlay where the dialog already provides its own header).
   */
  compactHeader?: boolean;
  /**
   * Plain-boolean permissions for the reception flow. Server actions
   * still enforce these checks independently.
   */
  permissions: StudentScanPanelPermissions;
}

/**
 * Reception operations panel for a student QR scan. Shared between the
 * legacy in-page scanner (`QrCheckInPanel`) and the global-scan overlay so
 * the same business logic (real server actions, real entitlement rules,
 * real walk-in + mark-paid flows) is used in both places.
 *
 * This panel owns:
 *  - local mirror of the lookup result (refreshed on every action)
 *  - check-in / walk-in / sell-drop-in / mark-paid flows
 *  - nested confirmation overlays (no-entitlement, pending-payment)
 *
 * It does NOT own modal lifecycle — the parent decides when to close,
 * which enables "do not auto-close; wait for admin" in the overlay.
 */
export function StudentScanPanel({ result: initialResult, onRefresh, compactHeader, permissions }: StudentScanPanelProps) {
  const [result, setResult] = useState<QrLookupResult>(initialResult);
  const [checkInResults, setCheckInResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [isCheckingIn, startCheckIn] = useTransition();
  const [paymentConfirm, setPaymentConfirm] = useState<PaymentConfirmation | null>(null);
  const [noEntTarget, setNoEntTarget] = useState<NoEntitlementTarget | null>(null);
  const [selectedPayMethod, setSelectedPayMethod] = useState<PaymentMethod>("cash");

  // Keep local state in sync if the parent swaps to a new scan result.
  useEffect(() => {
    setResult(initialResult);
    setCheckInResults(new Map());
    setPaymentConfirm(null);
    setNoEntTarget(null);
  }, [initialResult]);

  const refresh = useCallback(async () => {
    try {
      const next = await onRefresh();
      if (next) setResult(next);
    } catch {
      // Keep current result on refresh failure; individual action results
      // already surface errors in checkInResults.
    }
  }, [onRefresh]);

  function handleCheckIn(
    bookingId: string,
    entitlementPaymentStatus?: string,
    subscriptionId?: string,
    subscriptionName?: string,
    classTitle?: string,
  ) {
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
      if (res.success) refresh();
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
        studentId: result.student?.id,
        subscriptionId: cls.matchingSubscriptionId,
        subscriptionName: cls.matchingSubscriptionName ?? "Unknown plan",
        classTitle: cls.classTitle,
      });
      return;
    }
    doWalkIn(cls.classId, result.student?.id ?? "", cls.matchingSubscriptionId ?? "");
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
      if (res.success) refresh();
    });
  }

  function handleSellDropInAndCheckIn() {
    if (!noEntTarget || !result.student?.id) return;
    const target = noEntTarget;
    setNoEntTarget(null);
    const key = `walkin-${target.classId}`;
    startCheckIn(async () => {
      const res = await qrSellDropInAndCheckInAction(result.student!.id, target.classId);
      setCheckInResults((prev) => {
        const next = new Map(prev);
        next.set(key, {
          success: res.success,
          message: res.success ? `Drop-in sold and checked in for ${res.classTitle}` : res.error ?? "Failed",
        });
        return next;
      });
      if (res.success) refresh();
    });
  }

  function handleGoToAddProduct() {
    if (!result.student?.id || !noEntTarget) return;
    const params = new URLSearchParams({
      highlight: result.student.id,
      action: "add-subscription",
    });
    if (noEntTarget.styleName) params.set("style", noEntTarget.styleName);
    if (noEntTarget.classId) params.set("classId", noEntTarget.classId);
    setNoEntTarget(null);
    window.open(`/students?${params.toString()}`, "_blank");
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
      if (res.success) refresh();
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
      if (res.success) refresh();
    });
  }

  if (!result.success || !result.student) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm font-medium text-red-800">
            {result.error ?? "Student lookup failed"}
          </p>
        </div>
      </div>
    );
  }

  const student = result.student;

  return (
    <div className="space-y-3">
      {/* Student header */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          {!compactHeader && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bpm-100">
              <User className="h-6 w-6 text-bpm-600" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={`/students?highlight=${student.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-semibold text-bpm-600 hover:text-bpm-700 hover:underline"
            >
              {student.name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {student.email}
              </span>
              {student.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {student.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {result.hasActiveEntitlement ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
              <CreditCard className="h-3 w-3" /> Active entitlement
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              <CreditCard className="h-3 w-3" /> No active entitlement
            </span>
          )}
          {result.paymentPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-3 w-3" /> Payment pending
            </span>
          )}
        </div>

        {result.allEntitlements && result.allEntitlements.length > 0 ? (
          <AllEntitlementsSection
            entitlements={result.allEntitlements}
            onMarkPaid={permissions.canCollectPayment ? handleEntitlementMarkPaid : undefined}
          />
        ) : (
          <div className="border-t border-gray-100 pt-3">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs text-amber-800">
                This student has no entitlement history. They need to purchase a
                membership or pass.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Special Event Purchases */}
      {result.eventPurchases && result.eventPurchases.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Special Event Purchases ({result.eventPurchases.length})
          </h3>
          {result.eventPurchases.map((ep, idx) => (
            <EventPurchaseCard key={`${ep.eventId}-${idx}`} purchase={ep} />
          ))}
        </div>
      )}

      {/* Today's bookings */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Today&apos;s Bookings ({result.todayBookings?.length ?? 0})
        </h3>

        {!result.todayBookings || result.todayBookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
            <p className="text-sm text-gray-500">No bookings for today</p>
          </div>
        ) : (
          result.todayBookings.map((b) => (
            <BookingCheckInCard
              key={b.bookingId}
              booking={b}
              result={checkInResults.get(b.bookingId)}
              onCheckIn={
                permissions.canCheckIn
                  ? () =>
                      handleCheckIn(
                        b.bookingId,
                        b.entitlement?.paymentStatus,
                        b.entitlement?.subscriptionId,
                        b.entitlement?.productName,
                        b.classTitle,
                      )
                  : undefined
              }
              isPending={isCheckingIn}
            />
          ))
        )}
      </div>

      {/* Today's classes (walk-in / no-entitlement) */}
      {result.todayClasses && result.todayClasses.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Today&apos;s Classes ({result.todayClasses.length})
          </h3>
          {(!result.todayBookings || result.todayBookings.length === 0) && (
            <p className="text-xs text-gray-500">
              No bookings found. Select a class for walk-in check-in.
            </p>
          )}
          {result.todayClasses.map((cls) => (
            <TodayClassCard
              key={cls.classId}
              cls={cls}
              result={checkInResults.get(`walkin-${cls.classId}`)}
              onAction={permissions.canCheckIn ? () => handleWalkIn(cls) : undefined}
              isPending={isCheckingIn}
              studentHasAnyProduct={!!result.hasActiveEntitlement}
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
              className="w-full bg-bpm-600 hover:bg-bpm-700 text-white"
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
    </div>
  );
}
