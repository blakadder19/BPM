"use client";

import Link from "next/link";
import { Users, ShoppingBag } from "lucide-react";
import { formatTime } from "@/lib/utils";
import { getClassLevelDescription } from "@/config/class-levels";
import {
  RowMeta,
  MetaTime,
  MetaLocation,
  ActionPill,
  InlineBadge,
  ClassListItem,
} from "@/components/student/primitives";
import type { ValidEntitlement } from "@/lib/domain/entitlement-rules";

export interface ClassCardData {
  id: string;
  /** Template (recurring class) ID — null for ad-hoc instances */
  classId: string | null;
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
  | { status: "needs_role"; entitlements: ValidEntitlement[]; autoSelected?: ValidEntitlement }
  | { status: "blocked"; reason: string; needsProduct?: boolean }
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
  const isEntitlementBlocked = b.status === "blocked" && b.needsProduct;

  const borderColor = isEntitlementBlocked
    ? "border-amber-200"
    : isBlocked
      ? "border-gray-200"
      : b.status === "already_booked" && b.bookingStatus === "checked_in"
      ? "border-green-200"
      : b.status === "already_booked"
        ? "border-blue-200"
        : b.status === "already_waitlisted"
          ? "border-amber-200"
          : b.status === "restore_available"
            ? "border-orange-200"
            : "border-gray-200";

  const bgColor = isEntitlementBlocked
    ? "bg-amber-50/40"
    : isBlocked
      ? "bg-gray-50/80"
      : b.status === "already_booked" && b.bookingStatus === "checked_in"
      ? "bg-green-50/50"
      : b.status === "already_booked"
        ? "bg-blue-50/50"
        : b.status === "already_waitlisted"
          ? "bg-amber-50/50"
          : b.status === "restore_available"
            ? "bg-orange-50/50"
            : "bg-white";

  return (
    <ClassListItem border={borderColor} bg={bgColor} className={isBlocked && !isEntitlementBlocked ? "opacity-70" : ""}
      name={data.title}
      badges={
          <>
            {data.styleName && <InlineBadge>{data.styleName}</InlineBadge>}
            {data.level && <InlineBadge className="bg-gray-100 text-gray-600">{data.level}</InlineBadge>}
            {data.danceStyleRequiresBalance && <InlineBadge className="bg-violet-50 text-violet-600">Role</InlineBadge>}
          </>
        }
        meta={
          <RowMeta>
            <MetaTime>{formatTime(data.startTime)} – {formatTime(data.endTime)}</MetaTime>
            <MetaLocation>{data.location}</MetaLocation>
            {spotsLeft !== null && (
              <span className={`inline-flex items-center gap-1 ${
                spotsLeft <= 3 && spotsLeft > 0
                  ? "text-amber-600 font-medium"
                  : spotsLeft === 0
                    ? "text-red-500 font-medium"
                    : ""
              }`}>
                <Users className="h-3 w-3" />
                {spotsLeft === 0 ? "Full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""}`}
              </span>
            )}
          </RowMeta>
        }
        action={
          <CompactActionEl
            bookability={b}
            onBook={() => onBook(data)}
            onRestore={
              b.status === "restore_available" && onRestore
                ? () => onRestore(b.bookingId)
                : undefined
            }
            onAcceptCoc={onAcceptCoc}
          />
        }
        extra={
          <>
            {(b.status === "bookable" || b.status === "needs_role" || b.status === "waitlistable") && b.entitlements.length > 0 && (
              <div className="mt-1.5">
                <EntitlementHint entitlements={b.entitlements} autoSelected={(b.status === "bookable" || b.status === "needs_role") ? b.autoSelected : undefined} />
              </div>
            )}
            {b.status === "needs_role" && (
              <p className="mt-1 text-[10px] text-violet-600">Select your dance role when booking</p>
            )}
            {b.status === "waitlistable" && (
              <p className="mt-1 text-[10px] text-amber-600">{b.reason}</p>
            )}
            {b.status === "blocked" && b.needsProduct && (
              <div className="mt-1.5 space-y-1.5">
                <p className="text-[11px] text-gray-600">{b.reason}</p>
                <Link
                  href="/catalog"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-bpm-600 hover:text-bpm-700 hover:underline"
                >
                  <ShoppingBag className="h-3 w-3" />
                  Browse memberships, passes & drop-ins
                </Link>
              </div>
            )}
            {isBlocked && !(b.status === "blocked" && b.needsProduct) && (
              <p className="mt-1.5 text-[11px] text-gray-600">
                {(b.status === "blocked" || b.status === "not_bookable") ? b.reason : ""}
              </p>
            )}
            {b.status === "restore_available" && (
              <p className="mt-1 text-[10px] text-orange-600">Cancelled — tap Restore to rebook</p>
            )}
          </>
        }
    />
  );
}

const COC_REASON_MATCH = /code of conduct/i;

function CompactActionEl({
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
      return <ActionPill variant="primary" onClick={onBook}>Book</ActionPill>;
    case "needs_role":
      return <ActionPill variant="primary" onClick={onBook}>Book</ActionPill>;
    case "waitlistable":
      return <ActionPill variant="waitlist" onClick={onBook}>Waitlist</ActionPill>;
    case "already_booked":
      return (
        <InlineBadge className={
          b.bookingStatus === "checked_in"
            ? "bg-green-100 text-green-700"
            : "bg-blue-100 text-blue-700"
        }>
          {b.bookingStatus === "checked_in" ? "Checked in" : "Booked"}
        </InlineBadge>
      );
    case "already_waitlisted":
      return <InlineBadge className="bg-amber-100 text-amber-700">#{b.position} queued</InlineBadge>;
    case "restore_available":
      return onRestore ? <ActionPill variant="restore" onClick={onRestore}>Restore</ActionPill> : null;
    case "blocked":
      if (onAcceptCoc && COC_REASON_MATCH.test(b.reason)) {
        return <ActionPill variant="coc" onClick={onAcceptCoc}>Accept CoC</ActionPill>;
      }
      if (b.needsProduct) {
        return (
          <Link
            href="/catalog"
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold bg-bpm-100 text-bpm-700 hover:bg-bpm-200 transition-colors"
          >
            <ShoppingBag className="h-3 w-3" />
            Get a plan
          </Link>
        );
      }
      return <InlineBadge className="bg-gray-100 text-gray-500">Blocked</InlineBadge>;
    case "not_bookable":
      return <InlineBadge className="bg-gray-100 text-gray-500">N/A</InlineBadge>;
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
    usageLabel = `${left}/${ent.classesPerTerm} left`;
  } else if (ent.remainingCredits !== null && ent.totalCredits !== null) {
    usageLabel = `${ent.remainingCredits}/${ent.totalCredits} left`;
  } else if (ent.remainingCredits !== null) {
    usageLabel = `${ent.remainingCredits} credit${ent.remainingCredits !== 1 ? "s" : ""} left`;
  } else {
    usageLabel = "Unlimited";
  }

  return (
    <p className="text-[10px] text-gray-600">
      <span className="font-medium text-gray-700">{ent.productName}</span>
      <span className="mx-0.5">·</span>
      <span>{usageLabel}</span>
      {entitlements.length > 1 && (
        <span className="text-gray-400"> (+{entitlements.length - 1})</span>
      )}
    </p>
  );
}
