"use client";

import { useState, useMemo, useTransition, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";
import { isClassEnded } from "@/lib/domain/datetime";
import { BookingDetailPanel } from "./booking-detail-panel";
import {
  AddBookingDialog,
  CancelBookingDialog,
  DeleteBookingDialog,
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
import type { ProductAccessRule } from "@/config/product-access";
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
  { value: "birthday", label: "Birthday" },
];

// ── Props ────────────────────────────────────────────────────

interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}

interface ServerFilters {
  status: string;
  role: string;
  source: string;
  type: string;
  location: string;
  upcomingOnly: boolean;
  waitlistOnly: boolean;
}

interface FilterOption {
  value: string;
  label: string;
}

interface AdminBookingsProps {
  bookings: BookingView[];
  students: StudentOption[];
  classInstances: ClassInstanceOption[];
  waitlistEntries: WaitlistEntryView[];
  subscriptionsByStudent: Record<string, SubscriptionOption[]>;
  accessRulesMap?: Record<string, ProductAccessRule>;
  initialSearch?: string;
  isDev?: boolean;
  today?: string;
  pagination?: PaginationMeta;
  serverFilters?: ServerFilters;
  typeOptions?: FilterOption[];
  locationOptions?: FilterOption[];
}

// ── Component ────────────────────────────────────────────────

export function AdminBookings({
  bookings,
  students,
  classInstances,
  waitlistEntries,
  subscriptionsByStudent,
  accessRulesMap,
  initialSearch,
  isDev,
  today: todayProp,
  pagination,
  serverFilters,
  typeOptions: typeOptionsProp,
  locationOptions: locationOptionsProp,
}: AdminBookingsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [, startTransition] = useTransition();

  const isServerPaginated = !!pagination;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<BookingView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookingView | null>(null);
  const [waitlistClassId, setWaitlistClassId] = useState<string | null>(null);

  const pushParams = useCallback(
    (updates: Record<string, string>) => {
      const sp = new URLSearchParams(currentParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      sp.delete("page");
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, currentParams]
  );

  const pushPage = useCallback(
    (page: number) => {
      const sp = new URLSearchParams(currentParams.toString());
      if (page <= 1) sp.delete("page");
      else sp.set("page", String(page));
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, currentParams]
  );

  const search = serverFilters ? (currentParams.get("q") ?? initialSearch ?? "") : (initialSearch ?? "");
  const statusFilter = serverFilters?.status ?? "";
  const roleFilter = serverFilters?.role ?? "";
  const sourceFilter = serverFilters?.source ?? "";
  const typeFilter = serverFilters?.type ?? "";
  const locationFilter = serverFilters?.location ?? "";
  const upcomingOnly = serverFilters?.upcomingOnly ?? true;
  const waitlistOnly = serverFilters?.waitlistOnly ?? false;

  const typeOptions = typeOptionsProp ?? [];
  const locationOptions = locationOptionsProp ?? [];

  const today = todayProp ?? new Date().toISOString().slice(0, 10);

  const displayBookings = bookings;
  const totalCount = pagination?.totalCount ?? bookings.length;

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

  const [searchDraft, setSearchDraft] = useState(search);

  function commitSearch(value: string) {
    setSearchDraft(value);
    pushParams({ q: value });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Manage student bookings, waitlist, and cancellations. Walk-in attendance is tracked separately in Attendance."
        actions={
          <>
            <AdminHelpButton pageKey="bookings" />
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Booking
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={searchDraft}
              onChange={(v) => {
                setSearchDraft(v);
                if (isServerPaginated) {
                  if (v === "") commitSearch("");
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isServerPaginated) commitSearch(searchDraft);
              }}
              onBlur={() => {
                if (isServerPaginated && searchDraft !== search) commitSearch(searchDraft);
              }}
              placeholder="Search by student or class…"
            />
          </div>
          <SelectFilter
            value={statusFilter}
            onChange={(v) => pushParams({ status: v })}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
          <SelectFilter
            value={roleFilter}
            onChange={(v) => pushParams({ role: v })}
            options={ROLE_OPTIONS}
            placeholder="All roles"
          />
          <SelectFilter
            value={sourceFilter}
            onChange={(v) => pushParams({ source: v })}
            options={SOURCE_OPTIONS}
            placeholder="All sources"
          />
          {typeOptions.length > 1 && (
            <SelectFilter
              value={typeFilter}
              onChange={(v) => pushParams({ type: v })}
              options={typeOptions}
              placeholder="All types"
            />
          )}
          {locationOptions.length > 1 && (
            <SelectFilter
              value={locationFilter}
              onChange={(v) => pushParams({ location: v })}
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
              onChange={(e) => pushParams({ upcoming: e.target.checked ? "" : "false" })}
              className="rounded border-gray-300"
            />
            Upcoming only
          </label>
          <label className="flex items-center gap-1.5 text-gray-600">
            <input
              type="checkbox"
              checked={waitlistOnly}
              onChange={(e) => pushParams({ waitlist: e.target.checked ? "true" : "" })}
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
      <AdminTable headers={HEADERS} count={totalCount}>
        {displayBookings.length === 0 && (
          <tr>
            <td colSpan={HEADERS.length} className="px-4 py-12 text-center text-sm text-gray-400">
              No bookings match your current filters.
            </td>
          </tr>
        )}
        {displayBookings.map((b) => {
          const isExpanded = expandedId === b.id;
          const isActive =
            b.status === "confirmed" || b.status === "checked_in";
          const classEnded = !!(b.endTime && isClassEnded(b.date, b.endTime));
          const actionsDisabled = b.isOrphaned || classEnded;

          return (
            <TableRowGroup key={b.id}>
              <tr
                className={`cursor-pointer hover:bg-gray-50 ${b.isOrphaned ? "opacity-60 bg-gray-50" : ""}`}
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
                <Td>
                  {b.classTitle}
                  {b.isOrphaned && (
                    <span className="ml-1.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">Orphaned</span>
                  )}
                </Td>
                <Td>
                  {b.date ? (
                    <>
                      {formatDate(b.date)}
                      <br />
                      <span className="text-xs text-gray-400">
                        {b.startTime ? formatTime(b.startTime) : "—"}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Td>
                <Td>{b.styleName ?? "—"}</Td>
                <Td>
                  {b.danceRole && b.danceStyleRequiresBalance ? (
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
                    {b.status === "confirmed" && !actionsDisabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCheckIn(b.id)}
                      >
                        Check In
                      </Button>
                    )}
                    {isActive && !actionsDisabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelTarget(b)}
                      >
                        Cancel
                      </Button>
                    )}
                    {(b.status === "cancelled" || b.status === "late_cancelled") && !actionsDisabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(b.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Restore
                      </Button>
                    )}
                    <button
                      onClick={() => setDeleteTarget(b)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Delete booking"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                </Td>
              </tr>
              {isExpanded && (
                <BookingDetailPanel
                  booking={b}
                  colSpan={HEADERS.length}
                  onCancel={() => setCancelTarget(b)}
                  onDelete={() => setDeleteTarget(b)}
                  onCheckIn={() => handleCheckIn(b.id)}
                  onRestore={() => handleRestore(b.id)}
                  onViewWaitlist={() => openWaitlistForBooking(b)}
                  isOrphaned={b.isOrphaned}
                  classEnded={classEnded}
                />
              )}
            </TableRowGroup>
          );
        })}
      </AdminTable>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-200 pt-4">
          <p className="text-sm text-gray-500">
            Showing {(pagination.currentPage - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)} of{" "}
            {pagination.totalCount} bookings
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.currentPage <= 1}
              onClick={() => pushPage(pagination.currentPage - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-gray-600">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.currentPage >= pagination.totalPages}
              onClick={() => pushPage(pagination.currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {showAdd && (
        <AddBookingDialog
          students={students}
          classInstances={classInstances}
          subscriptionsByStudent={subscriptionsByStudent}
          accessRulesMap={accessRulesMap}
          onClose={() => setShowAdd(false)}
        />
      )}

      {cancelTarget && (
        <CancelBookingDialog
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteBookingDialog
          booking={deleteTarget}
          onClose={() => setDeleteTarget(null)}
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
