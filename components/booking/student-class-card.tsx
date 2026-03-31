"use client";

import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";
import { getClassLevelDescription } from "@/config/class-levels";
import type { BookabilityResult } from "@/lib/domain/bookability";
import type { ValidEntitlement } from "@/lib/domain/entitlement-rules";

export interface ClassCardData {
  id: string;
  title: string;
  classType: string;
  styleName: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  maxCapacity: number | null;
  totalBooked: number;
  danceStyleRequiresBalance: boolean;
  bookability: SerializedBookability;
}

export type SerializedBookability =
  | { status: "bookable"; entitlements: ValidEntitlement[]; autoSelected?: ValidEntitlement }
  | { status: "waitlistable"; reason: string; entitlements: ValidEntitlement[] }
  | { status: "blocked"; reason: string }
  | { status: "already_booked"; bookingId: string; bookingStatus: string }
  | { status: "already_waitlisted"; waitlistId: string; position: number }
  | { status: "restore_available"; bookingId: string; bookingStatus: string }
  | { status: "not_bookable"; reason: string };

interface StudentClassCardProps {
  data: ClassCardData;
  onBook: (data: ClassCardData) => void;
  onRestore?: (bookingId: string) => void;
  onAcceptCoc?: () => void;
}

export function StudentClassCard({ data, onBook, onRestore, onAcceptCoc }: StudentClassCardProps) {
  const b = data.bookability;
  const spotsLeft =
    data.maxCapacity != null ? data.maxCapacity - data.totalBooked : null;

  const isBlocked = b.status === "blocked" || b.status === "not_bookable";

  return (
    <div
      className={`flex flex-col rounded-xl border shadow-sm transition-shadow ${
        isBlocked
          ? "border-gray-200 bg-gray-50 opacity-75"
          : b.status === "already_booked" && b.bookingStatus === "checked_in"
            ? "border-green-200 bg-green-50"
            : b.status === "already_booked"
              ? "border-blue-200 bg-blue-50"
              : b.status === "already_waitlisted"
                ? "border-amber-200 bg-amber-50"
                : b.status === "restore_available"
                  ? "border-orange-200 bg-orange-50"
                  : "border-gray-200 bg-white hover:shadow-md"
      }`}
    >
      <div className="flex-1 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900">{data.title}</h3>
          {data.danceStyleRequiresBalance && (
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              Role required
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {data.styleName && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {data.styleName}
            </span>
          )}
          {data.level && (
            <span
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
              title={getClassLevelDescription(data.level) ?? undefined}
            >
              {data.level}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1.5 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" />
            {formatDate(data.date)}
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-gray-400" />
            {formatTime(data.startTime)} – {formatTime(data.endTime)}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
            {data.location}
          </div>
          {spotsLeft !== null && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-gray-400" />
              <span
                className={
                  spotsLeft <= 3 && spotsLeft > 0
                    ? "font-medium text-amber-600"
                    : spotsLeft === 0
                      ? "font-medium text-red-500"
                      : ""
                }
              >
                {spotsLeft === 0
                  ? "Full"
                  : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 p-4 space-y-2">
        {(b.status === "bookable" || b.status === "waitlistable") && b.entitlements.length > 0 && (
          <EntitlementHint entitlements={b.entitlements} autoSelected={b.status === "bookable" ? b.autoSelected : undefined} />
        )}
        <BookabilityAction
          bookability={b}
          onBook={() => onBook(data)}
          onRestore={
            b.status === "restore_available" && onRestore
              ? () => onRestore(b.bookingId)
              : undefined
          }
          onAcceptCoc={onAcceptCoc}
        />
      </div>
    </div>
  );
}

const COC_REASON_MATCH = /code of conduct/i;

function BookabilityAction({
  bookability: b,
  onBook,
  onRestore,
  onAcceptCoc,
}: {
  bookability: SerializedBookability;
  onBook: () => void;
  onRestore?: () => void;
  onAcceptCoc?: () => void;
}) {
  switch (b.status) {
    case "bookable":
      return (
        <Button className="w-full" onClick={onBook}>
          Book
        </Button>
      );
    case "waitlistable":
      return (
        <div className="space-y-2">
          <p className="text-xs text-amber-700 text-center">{b.reason}</p>
          <Button variant="secondary" className="w-full" onClick={onBook}>
            Join Waitlist
          </Button>
        </div>
      );
    case "already_booked":
      return (
        <div className="flex items-center justify-center gap-2 py-1">
          <StatusBadge status={b.bookingStatus === "checked_in" ? "checked_in" : "confirmed"} />
          <span className={`text-sm ${b.bookingStatus === "checked_in" ? "text-green-700" : "text-blue-700"}`}>
            {b.bookingStatus === "checked_in" ? "Checked in" : "You\u2019re booked"}
          </span>
        </div>
      );
    case "already_waitlisted":
      return (
        <div className="flex items-center justify-center gap-2 py-1">
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            #{b.position} in queue
          </span>
          <span className="text-sm text-amber-700">Waitlisted</span>
        </div>
      );
    case "restore_available":
      return (
        <div className="space-y-2">
          <p className="text-center text-xs text-orange-700">
            Cancelled — can be restored
          </p>
          {onRestore && (
            <Button variant="outline" className="w-full" onClick={onRestore}>
              Restore Booking
            </Button>
          )}
        </div>
      );
    case "blocked":
      if (onAcceptCoc && COC_REASON_MATCH.test(b.reason)) {
        return (
          <div className="space-y-2">
            <p className="text-center text-xs text-amber-700">{b.reason}</p>
            <Button variant="secondary" className="w-full" onClick={onAcceptCoc}>
              Accept Code of Conduct
            </Button>
          </div>
        );
      }
      return (
        <p className="text-center text-sm text-gray-500 py-1">{b.reason}</p>
      );
    case "not_bookable":
      return (
        <p className="text-center text-sm text-gray-400 py-1">{b.reason}</p>
      );
  }
}

function EntitlementHint({
  entitlements,
  autoSelected,
}: {
  entitlements: ValidEntitlement[];
  autoSelected?: ValidEntitlement;
}) {
  const ent = autoSelected ?? entitlements[0];
  if (!ent) return null;

  let usageLabel: string;
  if (ent.classesPerTerm !== null) {
    const left = Math.max(0, ent.classesPerTerm - ent.classesUsed);
    usageLabel = `${left} of ${ent.classesPerTerm} classes left`;
  } else if (ent.remainingCredits !== null && ent.totalCredits !== null) {
    usageLabel = `${ent.remainingCredits} of ${ent.totalCredits} credits left`;
  } else if (ent.remainingCredits !== null) {
    usageLabel = `${ent.remainingCredits} credit${ent.remainingCredits !== 1 ? "s" : ""} left`;
  } else {
    usageLabel = "Unlimited";
  }

  return (
    <div className="text-center text-xs text-gray-500">
      <span className="font-medium text-gray-700">{ent.productName}</span>
      <span className="mx-1">·</span>
      <span>{usageLabel}</span>
      {entitlements.length > 1 && (
        <span className="text-gray-400"> (+{entitlements.length - 1} more)</span>
      )}
    </div>
  );
}
