"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatTime } from "@/lib/utils";
import { createStudentBooking } from "@/lib/actions/booking";
import type { ValidEntitlement } from "@/lib/domain/entitlement-rules";
import type { DanceRole } from "@/types/domain";

export interface BookDialogClass {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  styleName: string | null;
  level: string | null;
  danceStyleRequiresBalance: boolean;
  spotsLeft: number | null;
}

interface StudentBookDialogProps {
  cls: BookDialogClass;
  entitlements: ValidEntitlement[];
  autoSelected?: ValidEntitlement;
  isWaitlist: boolean;
  waitlistReason?: string;
  onClose: () => void;
}

export function StudentBookDialog({
  cls,
  entitlements,
  autoSelected,
  isWaitlist,
  waitlistReason,
  onClose,
}: StudentBookDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedSubId, setSelectedSubId] = useState<string>(
    autoSelected?.subscriptionId ?? entitlements[0]?.subscriptionId ?? ""
  );
  const [danceRole, setDanceRole] = useState<DanceRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    status: "confirmed" | "waitlisted";
    className: string;
    position?: number;
  } | null>(null);

  function handleSubmit() {
    if (!selectedSubId) {
      setError("Please select an entitlement.");
      return;
    }
    if (cls.danceStyleRequiresBalance && !danceRole) {
      setError("Please select your dance role.");
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await createStudentBooking({
        bookableClassId: cls.id,
        subscriptionId: selectedSubId,
        danceRole,
      });
      if (res.success) {
        setResult({
          status: res.status!,
          className: res.className ?? cls.title,
          position: res.waitlistPosition,
        });
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isWaitlist ? "Join Waitlist" : "Book Class"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Class Summary */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
            <p className="font-medium text-gray-900">{cls.title}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{formatDate(cls.date)}</span>
              <span>{formatTime(cls.startTime)} – {formatTime(cls.endTime)}</span>
              <span>{cls.location}</span>
            </div>
            <div className="flex gap-1.5 mt-1">
              {cls.styleName && (
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {cls.styleName}
                </span>
              )}
              {cls.level && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {cls.level}
                </span>
              )}
              {cls.spotsLeft !== null && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls.spotsLeft <= 3 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                  {cls.spotsLeft} spot{cls.spotsLeft !== 1 ? "s" : ""} left
                </span>
              )}
            </div>
          </div>

          {isWaitlist && waitlistReason && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {waitlistReason}. You'll be placed on the waitlist and notified if a spot opens.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {result ? (
            <div className="space-y-2">
              {result.status === "confirmed" ? (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                  You're booked for <strong>{result.className}</strong>!
                </div>
              ) : (
                <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  You've been added to the waitlist for <strong>{result.className}</strong> (position #{result.position}).
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Entitlement Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Use entitlement
                </label>
                {entitlements.length === 1 ? (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                    {entitlements[0].description}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entitlements.map((e) => (
                      <label
                        key={e.subscriptionId}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          selectedSubId === e.subscriptionId
                            ? "border-blue-400 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="entitlement"
                          value={e.subscriptionId}
                          checked={selectedSubId === e.subscriptionId}
                          onChange={() => setSelectedSubId(e.subscriptionId)}
                          className="accent-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {e.productName}
                          </p>
                          <p className="text-xs text-gray-500">{e.description}</p>
                        </div>
                        <StatusBadge status={e.productType} />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Role Selection */}
              {cls.danceStyleRequiresBalance && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Dance role
                  </label>
                  <div className="flex gap-3">
                    {(["leader", "follower"] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`flex-1 rounded-lg border p-2.5 text-sm font-medium capitalize transition-colors ${
                          danceRole === role
                            ? "border-blue-400 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                        onClick={() => setDanceRole(role)}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
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
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending
                  ? "Processing…"
                  : isWaitlist
                    ? "Join Waitlist"
                    : "Confirm Booking"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
