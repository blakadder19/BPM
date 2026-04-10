"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarPlus, Inbox, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
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
import {
  RowMeta,
  StatusPill,
  ActionPill,
  InlineBadge,
  BookingListItem,
  SectionLabel,
} from "@/components/student/primitives";
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
  const isNotEnded = (date: string, endTime: string) => {
    if (!date || !endTime) return false;
    const t = endTime.length <= 5 ? `${endTime}:00` : endTime;
    return new Date() <= new Date(`${date}T${t}`);
  };

  const cancelledStatuses = new Set(["cancelled", "late_cancelled"]);
  const terminalStatuses = new Set(["cancelled", "late_cancelled", "missed"]);

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => isNotEnded(b.date, b.endTime) && !terminalStatuses.has(b.status) && !b.isOrphaned)
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );

  const restorableCancelled = useMemo(
    () =>
      bookings
        .filter((b) => isNotEnded(b.date, b.endTime) && cancelledStatuses.has(b.status) && !b.isOrphaned && !b.isAcademyCancelled)
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );

  const past = useMemo(
    () =>
      bookings
        .filter((b) => {
          // Orphaned bookings with no usable date are already filtered server-side,
          // but guard here too — never show rows without a date
          if (!b.date) return false;
          if (b.isAcademyCancelled) return true;
          if (isNotEnded(b.date, b.endTime) && !terminalStatuses.has(b.status)) return false;
          if (isNotEnded(b.date, b.endTime) && cancelledStatuses.has(b.status)) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings]
  );

  const [cancelTarget, setCancelTarget] = useState<BookingView | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BookingView | null>(null);

  return (
    <div className="space-y-3">
      <PageHeader
        title="My Bookings"
        description="Your upcoming and past class bookings."
        actions={
          <Link href="/classes">
            <Button size="sm">
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              Book a class
            </Button>
          </Link>
        }
      />

      <div data-tour="bookings-list" />

      {bookings.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No bookings yet"
          description="Browse available classes and book your first one!"
          action={
            <Link href="/classes">
              <Button size="sm">Browse classes</Button>
            </Link>
          }
        />
      ) : (
        <>
          <section data-tour="booking-cancel" className="space-y-1.5">
            <SectionLabel>Upcoming ({upcoming.length})</SectionLabel>
            {upcoming.length === 0 ? (
              <p className="text-xs italic text-gray-400 px-1">No upcoming bookings.</p>
            ) : (
              upcoming.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  showCancel
                  onCancel={() => setCancelTarget(b)}
                />
              ))
            )}
          </section>

          {waitlistEntries.length > 0 && (
            <section className="space-y-1.5">
              <SectionLabel>Waitlisted ({waitlistEntries.length})</SectionLabel>
              {waitlistEntries.map((w) => (
                <WaitlistCard key={w.id} entry={w} />
              ))}
            </section>
          )}

          {restorableCancelled.length > 0 && (
            <section className="space-y-1.5">
              <SectionLabel>Recently Cancelled ({restorableCancelled.length})</SectionLabel>
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
            <PastBookingsSection bookings={past} />
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

const PAST_PAGE_SIZE = 10;

function PastBookingsSection({ bookings }: { bookings: BookingView[] }) {
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAST_PAGE_SIZE);

  const visibleBookings = expanded ? bookings.slice(0, visibleCount) : [];
  const hasMore = visibleCount < bookings.length;

  return (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-gray-50 transition-colors"
      >
        <SectionLabel>Past &amp; Completed ({bookings.length})</SectionLabel>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>
      {expanded && (
        <>
          {visibleBookings.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
          {hasMore && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAST_PAGE_SIZE)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                Show more ({bookings.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </section>
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
  const borderColor = b.isAcademyCancelled
    ? "border-gray-200"
    : b.status === "confirmed"
      ? "border-green-200"
      : b.status === "checked_in"
        ? "border-green-200"
        : "border-gray-200";

  return (
    <BookingListItem
      border={borderColor}
      bg={b.isAcademyCancelled ? "bg-gray-50/80" : "bg-white"}
      name={b.classTitle}
      muted={b.isAcademyCancelled}
      badge={b.danceRole ? <InlineBadge className="bg-gray-100 text-gray-600">{b.danceRole}</InlineBadge> : undefined}
      meta={
        <RowMeta>
          {b.date ? <span>{formatDate(b.date)}</span> : <span className="text-gray-400">—</span>}
          {b.startTime ? <span>{formatTime(b.startTime)}</span> : null}
          {b.location && <span className="truncate max-w-[120px] sm:max-w-none">{b.location}</span>}
        </RowMeta>
      }
      status={
        b.isAcademyCancelled
          ? <InlineBadge className="bg-gray-200 text-gray-600">Academy</InlineBadge>
          : <StatusPill status={b.status} />
      }
      action={
        <>
          {showCancel && onCancel && (
            <button
              onClick={onCancel}
              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Cancel booking"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
          {showRestore && onRestore && (
            <ActionPill variant="restore" onClick={onRestore}>Restore</ActionPill>
          )}
        </>
      }
      extra={
        b.isAcademyCancelled && b.creditReturned
          ? <p className="mt-0.5 text-[10px] text-green-700">Credit returned</p>
          : undefined
      }
    />
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
    <BookingListItem
      border="border-amber-200"
      bg="bg-amber-50/60"
      name={w.classTitle}
      badge={
        <>
          {w.danceRole && <InlineBadge className="bg-amber-100 text-amber-700">{w.danceRole}</InlineBadge>}
          <InlineBadge className="bg-amber-100 text-amber-800">#{w.position}</InlineBadge>
        </>
      }
      meta={
        <RowMeta>
          <span>{formatDate(w.date)}</span>
          <span>{formatTime(w.startTime)}</span>
          {w.location && <span className="truncate max-w-[120px] sm:max-w-none">{w.location}</span>}
        </RowMeta>
      }
      action={
        <button
          onClick={handleLeave}
          disabled={isPending}
          className="rounded-md p-1.5 text-amber-600 hover:bg-amber-100 hover:text-amber-800 transition-colors disabled:opacity-50"
          title="Leave waitlist"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      }
    />
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
            {booking.date ? (
              <p>{formatDate(booking.date)}{booking.startTime ? ` · ${formatTime(booking.startTime)}` : ""}</p>
            ) : (
              <p className="text-gray-400">Date unavailable</p>
            )}
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
            {booking.date ? (
              <p>{formatDate(booking.date)}{booking.startTime ? ` · ${formatTime(booking.startTime)}` : ""}</p>
            ) : (
              <p className="text-gray-400">Date unavailable</p>
            )}
            {booking.location && <p>{booking.location}</p>}
            <div className="mt-1">
              <StatusPill status={booking.status} />
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

