"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Inbox, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate, formatTime, formatCents } from "@/lib/utils";
import { checkLateCancelStatusAction } from "@/lib/actions/bookings-admin";
import { studentCancelBookingAction } from "@/lib/actions/booking-student";
import type { BookingView } from "@/app/(app)/bookings/page";

export function StudentBookings({ bookings }: { bookings: BookingView[] }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.date >= today && b.status !== "cancelled" && b.status !== "late_cancelled")
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [bookings, today]
  );

  const past = useMemo(
    () =>
      bookings
        .filter((b) => b.date < today || b.status === "cancelled" || b.status === "late_cancelled")
        .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)),
    [bookings, today]
  );

  const [cancelTarget, setCancelTarget] = useState<BookingView | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Bookings"
        description="Your upcoming and past class bookings."
        actions={
          <Link href="/classes">
            <Button>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Book a class
            </Button>
          </Link>
        }
      />

      {bookings.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No bookings yet"
          description="Browse available classes and book your first one!"
          action={
            <Link href="/classes">
              <Button>Browse classes</Button>
            </Link>
          }
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Upcoming ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm italic text-gray-400">No upcoming bookings.</p>
            ) : (
              upcoming.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  showCancel={b.status === "confirmed" || b.status === "checked_in"}
                  onCancel={() => setCancelTarget(b)}
                />
              ))
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Past & Cancelled ({past.length})
              </h2>
              {past.map((b) => (
                <BookingCard key={b.id} booking={b} showCancel={false} onCancel={() => {}} />
              ))}
            </section>
          )}
        </>
      )}

      {cancelTarget && (
        <StudentCancelDialog
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

function BookingCard({
  booking: b,
  showCancel,
  onCancel,
}: {
  booking: BookingView;
  showCancel: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="font-medium text-gray-900">{b.classTitle}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span>{formatDate(b.date)}</span>
          <span>{formatTime(b.startTime)}</span>
          {b.location && <span>{b.location}</span>}
          {b.danceRole && <StatusBadge status={b.danceRole} />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={b.status} />
        {showCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <XCircle className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function StudentCancelDialog({
  booking,
  onClose,
}: {
  booking: BookingView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lateInfo, setLateInfo] = useState<{
    isLate: boolean;
    cutoffMinutes: number;
    feeCents: number;
  } | null>(null);
  const [result, setResult] = useState<{
    isLate: boolean;
    penaltyApplied: boolean;
    penaltyDescription?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkLateCancelStatusAction(booking.id).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setLateInfo({
          isLate: res.isLate!,
          cutoffMinutes: res.cutoffMinutes!,
          feeCents: res.lateCancelFeeCents!,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  function handleCancel() {
    startTransition(async () => {
      const res = await studentCancelBookingAction(booking.id);
      if (res.success) {
        setResult({
          isLate: res.isLate!,
          penaltyApplied: res.penaltyApplied!,
          penaltyDescription: res.penaltyDescription,
        });
        router.refresh();
      } else {
        setError(res.error ?? "Failed to cancel booking");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Booking</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1 text-sm text-gray-600">
            <p className="font-medium text-gray-900">{booking.classTitle}</p>
            <p>
              {formatDate(booking.date)} · {formatTime(booking.startTime)}
            </p>
            {booking.location && <p>{booking.location}</p>}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                Booking cancelled successfully.
              </div>
              {result.penaltyApplied && result.penaltyDescription && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  {result.penaltyDescription}
                </div>
              )}
            </div>
          ) : (
            <>
              {lateInfo?.isLate && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">Late Cancellation Warning</p>
                  <p className="mt-1">
                    This booking is within the late cancellation window (less
                    than {lateInfo.cutoffMinutes} minutes before class).
                    Cancelling now may trigger a penalty of{" "}
                    {formatCents(lateInfo.feeCents)}.
                  </p>
                </div>
              )}
              {lateInfo && !lateInfo.isLate && (
                <p className="text-sm text-gray-500">
                  Are you sure you want to cancel this booking? No penalty will
                  apply.
                </p>
              )}
              {!lateInfo && (
                <p className="text-sm text-gray-400">Checking cancellation status…</p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Keep Booking
              </Button>
              <Button
                variant="danger"
                onClick={handleCancel}
                disabled={isPending || !lateInfo}
              >
                {isPending
                  ? "Cancelling…"
                  : lateInfo?.isLate
                    ? "Cancel Anyway"
                    : "Cancel Booking"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
