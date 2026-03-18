"use client";

import Link from "next/link";
import { ExternalLink, X as XIcon, Check, Users, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatTime } from "@/lib/utils";
import type { BookingView } from "@/app/(app)/bookings/page";

interface BookingDetailPanelProps {
  booking: BookingView;
  colSpan: number;
  onCancel: () => void;
  onCheckIn: () => void;
  onViewWaitlist: () => void;
  onRestore?: () => void;
  hasLinkedPenalty?: boolean;
}

export function BookingDetailPanel({
  booking: b,
  colSpan,
  onCancel,
  onCheckIn,
  onViewWaitlist,
  onRestore,
  hasLinkedPenalty,
}: BookingDetailPanelProps) {
  const isActive = b.status === "confirmed" || b.status === "checked_in";
  const isCancelled = b.status === "cancelled" || b.status === "late_cancelled";

  return (
    <tr>
      <td colSpan={colSpan} className="bg-gray-50 p-0">
        <div className="grid gap-5 px-8 py-5 md:grid-cols-2">
          <Section title="Student">
            <DL label="Name" value={b.studentName} />
            <DL label="Student ID" value={b.studentId ?? "—"} />
            <DL label="Role" value={b.danceRole ?? "None"} />
          </Section>

          <Section title="Class Instance">
            <DL label="Class" value={b.classTitle} />
            <DL label="Date" value={formatDate(b.date)} />
            <DL
              label="Time"
              value={`${formatTime(b.startTime)}${b.endTime ? ` – ${formatTime(b.endTime)}` : ""}`}
            />
            <DL label="Style" value={b.styleName ?? "—"} />
            <DL label="Level" value={b.level ?? "—"} />
            <DL label="Location" value={b.location ?? "—"} />
            <DL label="Type" value={b.classType ?? "—"} />
          </Section>

          <Section title="Booking">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-28">
                Status
              </span>
              <StatusBadge status={b.status} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-28">
                Source
              </span>
              {b.source ? <StatusBadge status={b.source} /> : <span className="text-sm text-gray-700">—</span>}
            </div>
            <DL label="Subscription" value={b.subscriptionName ?? "—"} />
            <DL label="Booked At" value={formatDate(b.bookedAt)} />
            {b.adminNote && <DL label="Admin Note" value={b.adminNote} />}
          </Section>

          <Section title="Capacity">
            <DL
              label="Booked"
              value={
                b.maxCapacity != null
                  ? `${b.bookedCount ?? 0} / ${b.maxCapacity}`
                  : `${b.bookedCount ?? 0} (no limit)`
              }
            />
            {b.leaderCap != null && (
              <DL
                label="Leaders"
                value={`${b.leaderCount ?? 0} / ${b.leaderCap}`}
              />
            )}
            {b.followerCap != null && (
              <DL
                label="Followers"
                value={`${b.followerCount ?? 0} / ${b.followerCap}`}
              />
            )}
            <DL label="Waitlist" value={String(b.waitlistCount ?? 0)} />
          </Section>

          <Section title="Quick Links" className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              <QuickLink
                href={`/students?search=${encodeURIComponent(b.studentName)}`}
                label="View Student"
              />
              <QuickLink
                href={`/classes/bookable?search=${encodeURIComponent(b.classTitle)}`}
                label="Class Schedule"
              />
              <QuickLink
                href={`/attendance?classTitle=${encodeURIComponent(b.classTitle)}&date=${b.date}&student=${encodeURIComponent(b.studentName)}`}
                label="Attendance"
              />
              <QuickLink
                href={`/penalties?classTitle=${encodeURIComponent(b.classTitle)}&date=${b.date}&student=${encodeURIComponent(b.studentName)}`}
                label="Penalties"
              />
              <button
                onClick={onViewWaitlist}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-gray-50"
              >
                <Users className="h-3 w-3" />
                Waitlist
                <span className={`ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                  (b.waitlistCount ?? 0) > 0
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {b.waitlistCount ?? 0}
                </span>
              </button>
            </div>
          </Section>

          <Section title="Actions" className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              {b.status === "confirmed" && (
                <Button variant="outline" size="sm" onClick={onCheckIn}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Check In
                </Button>
              )}
              {isActive && (
                <Button variant="danger" size="sm" onClick={onCancel}>
                  <XIcon className="h-3.5 w-3.5 mr-1" />
                  Cancel Booking
                </Button>
              )}
              {isCancelled && onRestore && (
                <Button variant="outline" size="sm" onClick={onRestore}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Restore Booking
                </Button>
              )}
            </div>
            {isCancelled && hasLinkedPenalty && (
              <p className="mt-2 text-xs text-amber-600">
                A penalty is linked to this booking. Restoring will not automatically remove it.
              </p>
            )}
          </Section>
        </div>
      </td>
    </tr>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-gray-50"
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </Link>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DL({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs font-medium text-gray-500 w-28 flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-gray-700">{value}</span>
    </div>
  );
}
