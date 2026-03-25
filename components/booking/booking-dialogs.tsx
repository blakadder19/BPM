"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { effectiveInstanceStatus } from "@/lib/domain/datetime";
import type { InstanceStatus } from "@/types/domain";
import { SearchableSelect } from "@/components/ui/searchable-select";
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
  adminCreateBookingAction,
  adminCancelBookingAction,
  adminCheckInBookingAction,
  checkLateCancelStatusAction,
  adminPromoteWaitlistAction,
  adminRemoveFromWaitlistAction,
  computeBookingConsequencesAction,
  adminDeleteBookingAction,
  type BookingConsequences,
} from "@/lib/actions/bookings-admin";
import type { BookingView } from "@/app/(app)/bookings/page";

export interface StudentOption {
  id: string;
  fullName: string;
}

export interface ClassInstanceOption {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  styleName: string | null;
  level: string | null;
  location: string;
  status: string;
  maxCapacity: number | null;
  bookedCount: number;
  leaderCap: number | null;
  followerCap: number | null;
  leaderCount: number;
  followerCount: number;
  danceStyleRequiresBalance: boolean;
}

export interface WaitlistEntryView {
  id: string;
  classId: string;
  studentName: string;
  danceRole: string | null;
  position: number;
  joinedAt: string;
}

export interface SubscriptionOption {
  id: string;
  productName: string;
  productType: string;
  status: string;
  remainingCredits: number | null;
  classesPerTerm: number | null;
  classesUsed: number;
  termId: string | null;
  validFrom: string;
  validUntil: string | null;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const SOURCE_OPTIONS = [
  { value: "subscription", label: "Subscription" },
  { value: "drop_in", label: "Drop-in" },
  { value: "admin", label: "Admin" },
];

// ── Add Booking Dialog ────────────────────────────────────────

export function AddBookingDialog({
  students,
  classInstances,
  subscriptionsByStudent,
  onClose,
}: {
  students: StudentOption[];
  classInstances: ClassInstanceOption[];
  subscriptionsByStudent?: Record<string, SubscriptionOption[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSource, setSelectedSource] = useState("subscription");
  const [selectedSubscription, setSelectedSubscription] = useState("");
  const [forceConfirm, setForceConfirm] = useState(false);

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedClass = classInstances.find((c) => c.id === selectedClassId);
  const isFull =
    selectedClass &&
    selectedClass.maxCapacity !== null &&
    selectedClass.bookedCount >= selectedClass.maxCapacity;
  const requiresRole = selectedClass?.danceStyleRequiresBalance ?? false;

  const showSubscription = selectedSource === "subscription";

  const studentSubs = useMemo(() => {
    if (!selectedStudentId || !subscriptionsByStudent) return [];
    return subscriptionsByStudent[selectedStudentId] ?? [];
  }, [selectedStudentId, subscriptionsByStudent]);

  const studentSearchOptions = useMemo(
    () => students.map((s) => ({ value: s.id, label: s.fullName })),
    [students]
  );

  const STATUS_BADGE_MAP: Record<string, { label: string; variant: "success" | "default" | "info" | "danger" | "warning" }> = {
    open: { label: "Open", variant: "success" },
    scheduled: { label: "Scheduled", variant: "default" },
    closed: { label: "Closed", variant: "info" },
    cancelled: { label: "Cancelled", variant: "danger" },
    live: { label: "Live", variant: "warning" },
    ended: { label: "Ended", variant: "default" },
  };

  const classSearchOptions = useMemo(
    () =>
      classInstances
        .map((c) => {
          const effStatus = effectiveInstanceStatus(c.status as InstanceStatus, c.date, c.startTime, c.endTime);
          return { ...c, effStatus };
        })
        .filter((c) => c.effStatus !== "ended" && c.effStatus !== "cancelled" && c.effStatus !== "closed")
        .map((c) => {
          const capacityStr = c.maxCapacity
            ? `${c.bookedCount}/${c.maxCapacity} booked`
            : "Unlimited";
          const badgeConfig = STATUS_BADGE_MAP[c.effStatus] ?? { label: c.effStatus, variant: "default" as const };
          return {
            value: c.id,
            label: `${c.title} — ${formatDate(c.date)} ${formatTime(c.startTime)}`,
            detail: `${capacityStr} · ${c.location}`,
            badge: badgeConfig,
          };
        }),
    [classInstances]
  );

  const subscriptionSearchOptions = useMemo(
    () =>
      studentSubs.map((s) => {
        let detail: string;
        if (s.productType === "membership" && s.classesPerTerm !== null) {
          const remaining = s.classesPerTerm - s.classesUsed;
          detail = `${s.classesUsed}/${s.classesPerTerm} classes used (${remaining} left)`;
        } else if (s.productType === "drop_in") {
          detail = s.remainingCredits != null && s.remainingCredits > 0 ? "1 use available" : "Finished";
        } else if (s.remainingCredits != null) {
          detail = `${s.remainingCredits} credits remaining`;
        } else {
          detail = s.status;
        }
        return { value: s.id, label: s.productName, detail };
      }),
    [studentSubs]
  );

  const selectedSubOption = studentSubs.find((s) => s.id === selectedSubscription);
  const isEntitlementExhausted = selectedSubOption
    ? selectedSubOption.productType === "membership" && selectedSubOption.classesPerTerm !== null
      ? selectedSubOption.classesUsed >= selectedSubOption.classesPerTerm
      : selectedSubOption.productType === "drop_in"
        ? (selectedSubOption.remainingCredits ?? 0) <= 0
        : selectedSubOption.remainingCredits !== null && selectedSubOption.remainingCredits <= 0
    : false;

  useEffect(() => {
    setSelectedSubscription("");
  }, [selectedStudentId]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    fd.set("studentId", selectedStudentId);
    fd.set("studentName", selectedStudent?.fullName ?? "");
    fd.set("bookableClassId", selectedClassId);
    fd.set("source", selectedSource);

    if (showSubscription && selectedSubscription) {
      const sub = studentSubs.find((s) => s.id === selectedSubscription);
      fd.set("subscriptionName", sub?.productName ?? "");
      fd.set("subscriptionId", selectedSubscription);
    }

    if (forceConfirm) fd.set("forceConfirm", "true");

    if (!selectedStudentId) {
      setError("Student is required");
      return;
    }
    if (!selectedClassId) {
      setError("Class instance is required");
      return;
    }
    if (selectedSource === "subscription" && !selectedSubscription) {
      setError("A subscription must be selected for source = Subscription. If the student has none, use Drop-in or Admin instead.");
      return;
    }

    startTransition(async () => {
      const result = await adminCreateBookingAction(fd);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to create booking");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <Label>Student</Label>
              <SearchableSelect
                options={studentSearchOptions}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                placeholder="Search student by name…"
              />
            </div>

            <div>
              <Label>Class Instance</Label>
              <SearchableSelect
                options={classSearchOptions}
                value={selectedClassId}
                onChange={setSelectedClassId}
                placeholder="Search class…"
              />
            </div>

            {selectedClass && (
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
                <p className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>{" "}
                  <StatusBadge status={selectedClass.status} />
                  {selectedClass.status === "scheduled" && (
                    <span className="text-amber-600 font-medium">— Not yet open for student booking</span>
                  )}
                </p>
                <p>
                  <span className="font-medium">Capacity:</span>{" "}
                  {selectedClass.maxCapacity
                    ? `${selectedClass.bookedCount} / ${selectedClass.maxCapacity}`
                    : "Unlimited"}
                </p>
                {requiresRole && (
                  <p>
                    <span className="font-medium">Roles:</span>{" "}
                    Leaders {selectedClass.leaderCount}/{selectedClass.leaderCap ?? "∞"} ·{" "}
                    Followers {selectedClass.followerCount}/{selectedClass.followerCap ?? "∞"}
                  </p>
                )}
                {isFull && (
                  <p className="text-amber-600 font-medium">
                    Class is full — booking will be waitlisted unless forced.
                  </p>
                )}
              </div>
            )}

            {(selectedClass?.level?.startsWith("Beginner 1") || selectedClass?.level?.startsWith("Beginner 2")) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span className="font-medium">Term-bound course:</span> Late entry is controlled by the admin late-entry settings.
              </div>
            )}

            {requiresRole && (
              <div>
                <Label htmlFor="ab-role">Role</Label>
                <select id="ab-role" name="danceRole" required className={INPUT_CLASS}>
                  <option value="">Select role…</option>
                  <option value="leader">Leader</option>
                  <option value="follower">Follower</option>
                </select>
              </div>
            )}

            <div>
              <Label>Source</Label>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className={INPUT_CLASS}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {showSubscription && (
              <div>
                <Label>Subscription / Product *</Label>
                {studentSubs.length > 0 ? (
                  <SearchableSelect
                    options={subscriptionSearchOptions}
                    value={selectedSubscription}
                    onChange={setSelectedSubscription}
                    placeholder="Select subscription…"
                    disabled={!selectedStudentId}
                  />
                ) : selectedStudentId ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-medium">No eligible active subscription</p>
                    <p className="mt-1 text-xs">
                      This student has no active subscription for this class. Switch Source to <strong>Drop-in</strong> or <strong>Admin</strong> to create this booking without a subscription.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic py-1">
                    Select a student first.
                  </p>
                )}
              </div>
            )}

            {showSubscription && isEntitlementExhausted && selectedSubscription && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                This entitlement has no remaining classes/credits. The server will reject the booking unless you switch to a different source.
              </div>
            )}

            <div>
              <Label htmlFor="ab-note">
                Admin Note {selectedSource === "admin" ? "(recommended)" : "(optional)"}
              </Label>
              <textarea
                id="ab-note"
                name="adminNote"
                rows={2}
                className={INPUT_CLASS}
                placeholder={selectedSource === "admin" ? "Reason for admin override…" : "Internal note…"}
              />
              {selectedSource === "admin" && (
                <p className="mt-1 text-xs text-gray-400">
                  Admin bookings bypass subscription requirements. Adding a note helps track the reason.
                </p>
              )}
            </div>

            {isFull && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={forceConfirm}
                  onChange={(e) => setForceConfirm(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Force confirm (override capacity)
              </label>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || (showSubscription && !!selectedStudentId && studentSubs.length === 0)}
            >
              {isPending ? "Creating…" : "Create Booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared consequence summary ────────────────────────────────

function ConsequenceSummary({ c, mode }: { c: BookingConsequences; mode: "cancel" | "delete" }) {
  const items: React.ReactNode[] = [];

  if (c.hasStarted) {
    items.push(
      <li key="started" className="text-red-700">This class has already started.</li>
    );
  }

  if (mode === "cancel" && c.isLate && c.lateCancelPenaltiesEnabled) {
    items.push(
      <li key="penalty" className="text-amber-700">
        A late-cancel penalty of <strong>{formatCents(c.lateCancelFeeCents)}</strong> will be created.
      </li>
    );
  } else if (mode === "cancel" && !c.isLate) {
    items.push(
      <li key="no-penalty" className="text-gray-500">Normal cancellation window — no penalty.</li>
    );
  }

  if (c.willRefundCredit && c.refundDescription) {
    items.push(
      <li key="refund" className="text-blue-700">{c.refundDescription}</li>
    );
  } else if (c.hasSubscription && !c.willRefundCredit) {
    items.push(
      <li key="no-refund" className="text-gray-500">No credit refund (booking was already cancelled/not active).</li>
    );
  } else if (!c.hasSubscription && c.bookingSource !== "subscription") {
    items.push(
      <li key="no-sub" className="text-gray-500">
        Source: {c.bookingSource === "drop_in" ? "Drop-in" : c.bookingSource === "admin" ? "Admin" : c.bookingSource} — no subscription to refund.
      </li>
    );
  }

  if (c.waitlistCount > 0 && mode === "cancel") {
    items.push(
      <li key="waitlist" className="text-blue-700">
        The first of {c.waitlistCount} waitlisted student{c.waitlistCount !== 1 ? "s" : ""} will be promoted.
      </li>
    );
  }

  if (c.hasLinkedAttendance) {
    if (mode === "delete") {
      items.push(
        <li key="att" className="text-red-700">
          Linked attendance record ({c.attendanceStatus}) will be <strong>deleted</strong>.
        </li>
      );
    } else {
      items.push(
        <li key="att" className="text-amber-700">
          An attendance record ({c.attendanceStatus}) is linked to this booking.
        </li>
      );
    }
  }

  if (c.hasLinkedPenalty) {
    if (mode === "delete") {
      items.push(
        <li key="pen" className="text-red-700">
          Linked {c.penaltyReason === "late_cancel" ? "late-cancel" : "no-show"} penalty ({formatCents(c.penaltyAmountCents ?? 0)}) will be <strong>deleted</strong>.
        </li>
      );
    } else {
      items.push(
        <li key="pen" className="text-amber-700">
          A {c.penaltyReason === "late_cancel" ? "late-cancel" : "no-show"} penalty ({formatCents(c.penaltyAmountCents ?? 0)}) is linked to this booking.
        </li>
      );
    }
  }

  if (c.bookingStatus === "checked_in" && mode === "cancel") {
    items.push(
      <li key="checkedin" className="text-amber-700">This student is already checked in.</li>
    );
  }

  if (items.length === 0) {
    items.push(<li key="none" className="text-gray-400 italic">No additional consequences.</li>);
  }

  return <ul className="space-y-1.5 text-sm list-disc pl-4">{items}</ul>;
}

// ── Cancel Booking Dialog ─────────────────────────────────────

export function CancelBookingDialog({
  booking,
  onClose,
}: {
  booking: BookingView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [consequences, setConsequences] = useState<BookingConsequences | null>(null);
  const [result, setResult] = useState<{
    isLate: boolean;
    penaltyCreated: boolean;
    promotedStudent: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeBookingConsequencesAction(booking.id).then((res) => {
      if (cancelled) return;
      if (res.success && res.consequences) {
        setConsequences(res.consequences);
      }
    });
    return () => { cancelled = true; };
  }, [booking.id]);

  function handleCancel() {
    startTransition(async () => {
      const res = await adminCancelBookingAction(booking.id);
      if (res.success) {
        setResult({
          isLate: res.isLate!,
          penaltyCreated: res.penaltyCreated!,
          promotedStudent: res.promotedStudent ?? null,
        });
        router.refresh();
      } else {
        setError(res.error ?? "Failed to cancel");
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
            <p>
              <span className="font-medium text-gray-900">{booking.studentName}</span>{" "}
              — {booking.classTitle}
            </p>
            <p>{formatDate(booking.date)} · {formatTime(booking.startTime)}</p>
            <p className="flex items-center gap-2">
              <StatusBadge status={booking.status} />
              {booking.source && <StatusBadge status={booking.source} />}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {result ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                Booking cancelled successfully.
              </div>
              {result.isLate && result.penaltyCreated && (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Late cancellation penalty applied.
                </div>
              )}
              {result.promotedStudent && (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                  {result.promotedStudent} promoted from waitlist.
                </div>
              )}
            </div>
          ) : consequences ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">What will happen:</p>
              <ConsequenceSummary c={consequences} mode="cancel" />
            </div>
          ) : (
            <p className="text-sm text-gray-400 animate-pulse">Loading consequences…</p>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button variant="ghost" onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Keep Booking</Button>
              <Button
                variant="danger"
                onClick={handleCancel}
                disabled={isPending || !consequences}
              >
                {isPending
                  ? "Cancelling…"
                  : consequences?.isLate ? "Cancel (Late)" : "Cancel Booking"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Booking Dialog ─────────────────────────────────────

export function DeleteBookingDialog({
  booking,
  onClose,
}: {
  booking: BookingView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [consequences, setConsequences] = useState<BookingConsequences | null>(null);
  const [result, setResult] = useState<{
    deletedAttendance: boolean;
    deletedPenalty: boolean;
    refundedCredit: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    computeBookingConsequencesAction(booking.id).then((res) => {
      if (cancelled) return;
      if (res.success && res.consequences) {
        setConsequences(res.consequences);
      }
    });
    return () => { cancelled = true; };
  }, [booking.id]);

  function handleDelete() {
    startTransition(async () => {
      const res = await adminDeleteBookingAction(booking.id);
      if (res.success) {
        setResult({
          deletedAttendance: res.deletedAttendance ?? false,
          deletedPenalty: res.deletedPenalty ?? false,
          refundedCredit: res.refundedCredit ?? false,
        });
        router.refresh();
      } else {
        setError(res.error ?? "Failed to delete");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Booking</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">This is a permanent hard delete.</p>
            <p className="mt-1">
              Unlike cancellation, this completely removes the booking and all linked records. This action cannot be undone.
            </p>
          </div>

          <div className="space-y-1 text-sm text-gray-600">
            <p>
              <span className="font-medium text-gray-900">{booking.studentName}</span>{" "}
              — {booking.classTitle}
            </p>
            <p>{formatDate(booking.date)} · {formatTime(booking.startTime)}</p>
            <p className="flex items-center gap-2">
              <StatusBadge status={booking.status} />
              {booking.source && <StatusBadge status={booking.source} />}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {result ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                Booking permanently deleted.
              </div>
              {result.refundedCredit && (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                  Subscription credit/usage refunded.
                </div>
              )}
              {result.deletedAttendance && (
                <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
                  Linked attendance record removed.
                </div>
              )}
              {result.deletedPenalty && (
                <div className="rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
                  Linked penalty removed.
                </div>
              )}
            </div>
          ) : consequences ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">What will be removed:</p>
              <ConsequenceSummary c={consequences} mode="delete" />
            </div>
          ) : (
            <p className="text-sm text-gray-400 animate-pulse">Loading consequences…</p>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button variant="ghost" onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                disabled={isPending || !consequences}
              >
                {isPending ? "Deleting…" : "Permanently Delete"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Waitlist Dialog ───────────────────────────────────────────

export function WaitlistDialog({
  classTitle,
  date,
  entries,
  capacityInfo,
  onClose,
}: {
  classTitle: string;
  date: string;
  entries: WaitlistEntryView[];
  capacityInfo?: { booked: number; max: number | null };
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  function handlePromote(id: string) {
    startTransition(async () => {
      const res = await adminPromoteWaitlistAction(id);
      if (res.success) {
        setFlash("Promoted successfully");
        router.refresh();
      } else {
        setFlash(res.error ?? "Failed");
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      const res = await adminRemoveFromWaitlistAction(id);
      if (res.success) {
        setFlash("Removed from waitlist");
        router.refresh();
      } else {
        setFlash(res.error ?? "Failed");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waitlist — {classTitle}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="text-sm text-gray-500">
            {formatDate(date)}
            {capacityInfo && (
              <span className="ml-2">
                · Booked: {capacityInfo.booked}
                {capacityInfo.max !== null ? ` / ${capacityInfo.max}` : ""}
              </span>
            )}
          </div>

          {flash && (
            <div className="rounded-lg bg-blue-50 p-2 text-xs text-blue-700">
              {flash}
            </div>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No waitlist entries.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">
                      #{e.position} {e.studentName}
                    </span>
                    {e.danceRole && (
                      <StatusBadge status={e.danceRole} className="ml-2" />
                    )}
                    <span className="ml-2 text-xs text-gray-400">
                      Joined {formatDate(e.joinedAt)}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePromote(e.id)}
                      disabled={isPending}
                    >
                      Promote
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(e.id)}
                      disabled={isPending}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
