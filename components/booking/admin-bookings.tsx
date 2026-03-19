"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";
import { BookingDetailPanel } from "./booking-detail-panel";
import {
  AddBookingDialog,
  CancelBookingDialog,
  WaitlistDialog,
  type StudentOption,
  type ClassInstanceOption,
  type WaitlistEntryView,
  type SubscriptionOption,
} from "./booking-dialogs";
import {
  adminCheckInBookingAction,
  adminRestoreBookingAction,
} from "@/lib/actions/bookings-admin";
import type { BookingView } from "@/app/(app)/bookings/page";

// ── Filter options ───────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked In" },
  { value: "cancelled", label: "Cancelled" },
  { value: "late_cancelled", label: "Late Cancelled" },
  { value: "missed", label: "Missed" },
];

const ROLE_OPTIONS = [
  { value: "leader", label: "Leader" },
  { value: "follower", label: "Follower" },
  { value: "none", label: "No role" },
];

const SOURCE_OPTIONS = [
  { value: "subscription", label: "Subscription" },
  { value: "drop_in", label: "Drop-in" },
  { value: "admin", label: "Admin" },
  { value: "waitlist_promotion", label: "Waitlist Promo" },
];

// ── Props ────────────────────────────────────────────────────

interface AdminBookingsProps {
  bookings: BookingView[];
  students: StudentOption[];
  classInstances: ClassInstanceOption[];
  waitlistEntries: WaitlistEntryView[];
  subscriptionsByStudent: Record<string, SubscriptionOption[]>;
  initialSearch?: string;
  isDev?: boolean;
}

// ── Component ────────────────────────────────────────────────

export function AdminBookings({
  bookings,
  students,
  classInstances,
  waitlistEntries,
  subscriptionsByStudent,
  initialSearch,
  isDev,
}: AdminBookingsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  const [waitlistOnly, setWaitlistOnly] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingView | null>(null);
  const [waitlistClassId, setWaitlistClassId] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const typeOptions = useMemo(() => {
    const types = new Set(bookings.map((b) => b.classType).filter(Boolean));
    return Array.from(types).map((t) => ({ value: t!, label: t! }));
  }, [bookings]);

  const locationOptions = useMemo(() => {
    const locs = new Set(bookings.map((b) => b.location).filter(Boolean));
    return Array.from(locs).map((l) => ({ value: l!, label: l! }));
  }, [bookings]);

  const q = search.toLowerCase();

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (
        q &&
        !b.studentName.toLowerCase().includes(q) &&
        !b.classTitle.toLowerCase().includes(q)
      )
        return false;
      if (statusFilter && b.status !== statusFilter) return false;
      if (roleFilter === "none" && b.danceRole !== null) return false;
      if (roleFilter && roleFilter !== "none" && b.danceRole !== roleFilter)
        return false;
      if (sourceFilter && b.source !== sourceFilter) return false;
      if (typeFilter && b.classType !== typeFilter) return false;
      if (locationFilter && b.location !== locationFilter) return false;
      if (upcomingOnly && b.date < today) return false;
      if (waitlistOnly) {
        const hasWaitlist = waitlistEntries.some(
          (w) => w.classId === b.classId
        );
        if (!hasWaitlist) return false;
      }
      return true;
    });
  }, [
    bookings,
    q,
    statusFilter,
    roleFilter,
    sourceFilter,
    typeFilter,
    locationFilter,
    upcomingOnly,
    waitlistOnly,
    today,
    waitlistEntries,
  ]);

  const [restoreFlash, setRestoreFlash] = useState<string | null>(null);

  function handleCheckIn(bookingId: string) {
    startTransition(async () => {
      await adminCheckInBookingAction(bookingId);
      router.refresh();
    });
  }

  function handleRestore(bookingId: string) {
    startTransition(async () => {
      const res = await adminRestoreBookingAction(bookingId);
      if (res.success) {
        setRestoreFlash(
          `Booking restored to ${res.restoredTo}${res.hasLinkedPenalty ? " (linked penalty still exists)" : ""}`
        );
        router.refresh();
        setTimeout(() => setRestoreFlash(null), 5000);
      } else {
        setRestoreFlash(res.error ?? "Restore failed");
        setTimeout(() => setRestoreFlash(null), 5000);
      }
    });
  }

  function openWaitlistForBooking(b: BookingView) {
    setWaitlistClassId(b.classId ?? null);
  }

  const waitlistForDialog = useMemo(() => {
    if (!waitlistClassId) return [];
    return waitlistEntries.filter((w) => w.classId === waitlistClassId);
  }, [waitlistClassId, waitlistEntries]);

  const waitlistClassInfo = useMemo(() => {
    if (!waitlistClassId) return null;
    const ci = classInstances.find((c) => c.id === waitlistClassId);
    if (!ci) return null;
    return { title: ci.title, date: ci.date, booked: ci.bookedCount, max: ci.maxCapacity };
  }, [waitlistClassId, classInstances]);

  const HEADERS = [
    "",
    "Student",
    "Class",
    "Date / Time",
    "Style",
    "Role",
    "Source",
    "Status",
    "Actions",
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Manage student bookings, waitlist, and cancellations."
        actions={
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Booking
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by student or class…"
            />
          </div>
          <SelectFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
          <SelectFilter
            value={roleFilter}
            onChange={setRoleFilter}
            options={ROLE_OPTIONS}
            placeholder="All roles"
          />
          <SelectFilter
            value={sourceFilter}
            onChange={setSourceFilter}
            options={SOURCE_OPTIONS}
            placeholder="All sources"
          />
          {typeOptions.length > 1 && (
            <SelectFilter
              value={typeFilter}
              onChange={setTypeFilter}
              options={typeOptions}
              placeholder="All types"
            />
          )}
          {locationOptions.length > 1 && (
            <SelectFilter
              value={locationFilter}
              onChange={setLocationFilter}
              options={locationOptions}
              placeholder="All locations"
            />
          )}
        </div>

        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5 text-gray-600">
            <input
              type="checkbox"
              checked={upcomingOnly}
              onChange={(e) => setUpcomingOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Upcoming only
          </label>
          <label className="flex items-center gap-1.5 text-gray-600">
            <input
              type="checkbox"
              checked={waitlistOnly}
              onChange={(e) => setWaitlistOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Has waitlist
          </label>
        </div>
      </div>

      {restoreFlash && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
          {restoreFlash}
        </div>
      )}

      {/* Table */}
      <AdminTable headers={HEADERS} count={filtered.length}>
        {filtered.map((b) => {
          const isExpanded = expandedId === b.id;
          const isActive =
            b.status === "confirmed" || b.status === "checked_in";

          return (
            <TableRowGroup key={b.id}>
              <tr
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(isExpanded ? null : b.id)}
              >
                <Td className="w-8">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                </Td>
                <Td className="font-medium text-gray-900">
                  {b.studentName}
                </Td>
                <Td>{b.classTitle}</Td>
                <Td>
                  {formatDate(b.date)}
                  <br />
                  <span className="text-xs text-gray-400">
                    {formatTime(b.startTime)}
                  </span>
                </Td>
                <Td>{b.styleName ?? "—"}</Td>
                <Td>
                  {b.danceRole ? (
                    <StatusBadge status={b.danceRole} />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {b.source ? (
                    <StatusBadge status={b.source} />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  <StatusBadge status={b.status} />
                </Td>
                <Td>
                  <div
                    className="flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {b.status === "confirmed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCheckIn(b.id)}
                      >
                        Check In
                      </Button>
                    )}
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelTarget(b)}
                      >
                        Cancel
                      </Button>
                    )}
                    {(b.status === "cancelled" || b.status === "late_cancelled") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(b.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Restore
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
              {isExpanded && (
                <BookingDetailPanel
                  booking={b}
                  colSpan={HEADERS.length}
                  onCancel={() => setCancelTarget(b)}
                  onCheckIn={() => handleCheckIn(b.id)}
                  onRestore={() => handleRestore(b.id)}
                  onViewWaitlist={() => openWaitlistForBooking(b)}
                />
              )}
            </TableRowGroup>
          );
        })}
      </AdminTable>

      {/* Dialogs */}
      {showAdd && (
        <AddBookingDialog
          students={students}
          classInstances={classInstances}
          subscriptionsByStudent={subscriptionsByStudent}
          onClose={() => setShowAdd(false)}
        />
      )}

      {cancelTarget && (
        <CancelBookingDialog
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {waitlistClassId && waitlistClassInfo && (
        <WaitlistDialog
          classTitle={waitlistClassInfo.title}
          date={waitlistClassInfo.date}
          entries={waitlistForDialog}
          capacityInfo={{
            booked: waitlistClassInfo.booked,
            max: waitlistClassInfo.max,
          }}
          onClose={() => setWaitlistClassId(null)}
        />
      )}
    </div>
  );
}

function TableRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
