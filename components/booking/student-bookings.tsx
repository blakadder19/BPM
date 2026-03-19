"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Inbox, XCircle, RotateCcw } from "lucide-react";
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
import { studentRestoreBookingAction, checkRestoreEligibilityAction } from "@/lib/actions/booking-student";
import { studentLeaveWaitlistAction } from "@/lib/actions/waitlist-student";
import type { BookingView, StudentWaitlistView } from "@/app/(app)/bookings/page";

export function StudentBookings({
  bookings,
  waitlistEntries = [],
}: {
  bookings: BookingView[];
  waitlistEntries?: StudentWaitlistView[];
}) {
  const isFuture = (date: string, startTime: string) =>
    new Date() < new Date(`${date}T${startTime}:00`);

  const cancelledStatuses = new Set(["cancelled", "late_cancelled"]);
  const terminalStatuses = new Set(["cancelled", "late_cancelled", "missed"]);

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => isFuture(b.date, b.startTime) && !terminalStatuses.has(b.status))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );

  const restorableCancelled = useMemo(
    () =>
      bookings
        .filter((b) => isFuture(b.date, b.startTime) && cancelledStatuses.has(b.status))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );

  const past = useMemo(
    () =>
      bookings
        .filter((b) => {
          if (isFuture(b.date, b.startTime) && !terminalStatuses.has(b.status)) return false;
          if (isFuture(b.date, b.startTime) && cancelledStatuses.has(b.status)) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );

  const [cancelTarget, setCancelTarget] = useState<BookingView | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BookingView | null>(null);

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
                  showCancel={b.status === "confirmed"}
                  onCancel={() => setCancelTarget(b)}
                />
              ))
            )}
          </section>

          {waitlistEntries.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Waitlisted ({waitlistEntries.length})
              </h2>
              {waitlistEntries.map((w) => (
                <WaitlistCard key={w.id} entry={w} />
              ))}
            </section>
          )}

          {restorableCancelled.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Recently Cancelled ({restorableCancelled.length})
              </h2>
              <p className="text-xs text-gray-400">
                These bookings were cancelled for classes that have not started yet. You may be able to restore them.
              </p>
              {restorableCancelled.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  showRestore
                  onRestore={() => setRestoreTarget(b)}
                />
              ))}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Past & Completed ({past.length})
              </h2>
              {past.map((b) => (
                <BookingCard key={b.id} booking={b} />
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

      {restoreTarget && (
        <StudentRestoreDialog
          booking={restoreTarget}
          onClose={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}

function BookingCard({
  booking: b,
  showCancel,
  onCancel,
  showRestore,
  onRestore,
}: {
  booking: BookingView;
  showCancel?: boolean;
  onCancel?: () => void;
  showRestore?: boolean;
  onRestore?: () => void;
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
        {showCancel && onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <XCircle className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
        {showRestore && onRestore && (
          <Button variant="outline" size="sm" onClick={onRestore}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Restore
          </Button>
        )}
      </div>
    </div>
  );
}

function WaitlistCard({ entry: w }: { entry: StudentWaitlistView }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLeave() {
    startTransition(async () => {
      const res = await studentLeaveWaitlistAction(w.id);
      if (res.success) {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div>
        <h3 className="font-medium text-gray-900">{w.classTitle}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span>{formatDate(w.date)}</span>
          <span>{formatTime(w.startTime)}</span>
          {w.location && <span>{w.location}</span>}
          {w.danceRole && <StatusBadge status={w.danceRole} />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          #{w.position} in queue
        </span>
        <Button variant="ghost" size="sm" onClick={handleLeave} disabled={isPending}>
          <XCircle className="h-4 w-4 mr-1" />
          {isPending ? "Leaving…" : "Leave"}
        </Button>
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
    hasStarted: boolean;
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
          hasStarted: res.hasStarted!,
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
          ) : lateInfo?.hasStarted ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              This class has already started. Cancellation is no longer available.
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
          {result || lateInfo?.hasStarted ? (
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

function StudentRestoreDialog({
  booking,
  onClose,
}: {
  booking: BookingView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<{
    eligible: boolean;
    reason?: string;
  } | null>(null);
  const [result, setResult] = useState<{
    restoredTo: "confirmed" | "waitlisted";
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkRestoreEligibilityAction(booking.id).then((res) => {
      if (!cancelled) setEligibility(res);
    });
    return () => {
      cancelled = true;
    };
  }, [booking.id]);

  function handleRestore() {
    startTransition(async () => {
      const res = await studentRestoreBookingAction(booking.id);
      if (res.success) {
        setResult({ restoredTo: res.restoredTo! });
        router.refresh();
      } else {
        setError(res.error ?? "Failed to restore booking");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore Booking</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1 text-sm text-gray-600">
            <p className="font-medium text-gray-900">{booking.classTitle}</p>
            <p>
              {formatDate(booking.date)} · {formatTime(booking.startTime)}
            </p>
            {booking.location && <p>{booking.location}</p>}
            <div className="mt-1">
              <StatusBadge status={booking.status} />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {result ? (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {result.restoredTo === "confirmed"
                ? "Booking restored successfully! Your spot is confirmed."
                : "The class is currently full. You have been added to the waitlist."}
            </div>
          ) : eligibility === null ? (
            <p className="text-sm text-gray-400">Checking eligibility…</p>
          ) : !eligibility.eligible ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {eligibility.reason ?? "This booking cannot be restored."}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                Would you like to restore this booking? If a spot is available,
                your booking will be confirmed immediately. Otherwise, you will
                be added to the waitlist.
              </p>
              <p className="text-xs text-gray-400">
                If restored to confirmed, the corresponding class credit or
                pass usage will be re-consumed.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {result || (eligibility && !eligibility.eligible) ? (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Keep Cancelled
              </Button>
              <Button
                onClick={handleRestore}
                disabled={isPending || !eligibility?.eligible}
              >
                {isPending ? "Restoring…" : "Restore Booking"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
