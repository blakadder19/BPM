"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
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
  status: string;
  remainingCredits: number | null;
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

  const classSearchOptions = useMemo(
    () =>
      classInstances.map((c) => ({
        value: c.id,
        label: `${c.title} — ${formatDate(c.date)} ${formatTime(c.startTime)}`,
        detail: c.maxCapacity
          ? `${c.bookedCount}/${c.maxCapacity} booked · ${c.location}`
          : `${c.location}`,
      })),
    [classInstances]
  );

  const subscriptionSearchOptions = useMemo(
    () =>
      studentSubs.map((s) => ({
        value: s.id,
        label: s.productName,
        detail:
          s.remainingCredits != null
            ? `${s.remainingCredits} credits remaining`
            : s.status,
      })),
    [studentSubs]
  );

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
                <Label>Subscription / Product</Label>
                {studentSubs.length > 0 ? (
                  <SearchableSelect
                    options={subscriptionSearchOptions}
                    value={selectedSubscription}
                    onChange={setSelectedSubscription}
                    placeholder="Select subscription…"
                    disabled={!selectedStudentId}
                  />
                ) : selectedStudentId ? (
                  <p className="text-xs text-gray-400 italic py-1">
                    No active subscriptions for this student.
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 italic py-1">
                    Select a student first.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="ab-note">Admin Note (optional)</Label>
              <textarea
                id="ab-note"
                name="adminNote"
                rows={2}
                className={INPUT_CLASS}
                placeholder="Internal note…"
              />
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create Booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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
  const [result, setResult] = useState<{
    isLate: boolean;
    penaltyCreated: boolean;
    promotedStudent: string | null;
  } | null>(null);
  const [lateInfo, setLateInfo] = useState<{
    isLate: boolean;
    cutoffMinutes: number;
    minutesUntilStart: number;
    feeCents: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkLateCancelStatusAction(booking.id).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setLateInfo({
          isLate: res.isLate!,
          cutoffMinutes: res.cutoffMinutes!,
          minutesUntilStart: res.minutesUntilStart!,
          feeCents: res.lateCancelFeeCents!,
        });
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
              <span className="font-medium text-gray-900">
                {booking.studentName}
              </span>{" "}
              — {booking.classTitle}
            </p>
            <p>
              {formatDate(booking.date)} · {formatTime(booking.startTime)}
            </p>
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
          ) : (
            <>
              {lateInfo?.isLate && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">Late Cancellation Warning</p>
                  <p className="mt-1">
                    This booking is within the late cancellation window (less
                    than {lateInfo.cutoffMinutes} minutes before class).
                    Cancelling now will trigger a late cancellation penalty of{" "}
                    {formatCents(lateInfo.feeCents)}.
                  </p>
                </div>
              )}
              {lateInfo && !lateInfo.isLate && (
                <p className="text-sm text-gray-500">
                  This is within the normal cancellation window. No penalty will
                  apply.
                </p>
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
                    ? "Cancel (Late)"
                    : "Cancel Booking"}
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
