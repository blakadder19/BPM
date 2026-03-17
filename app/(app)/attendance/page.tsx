"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import {
  ClipboardCheck,
  Clock,
  MapPin,
  Check,
  X,
  Timer,
  ShieldOff,
  AlertTriangle,
  CalendarDays,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, cn } from "@/lib/utils";
import { BOOKABLE_CLASSES, BOOKINGS, ATTENDANCE } from "@/lib/mock-data";
import { markStudentAttendance } from "@/lib/actions/attendance";
import type { AttendanceMark, ClassType } from "@/types/domain";

// Fixed date for mock data — matches "today" in the seed
const MOCK_TODAY = "2026-03-17";

const MARK_OPTIONS: {
  value: AttendanceMark;
  label: string;
  icon: typeof Check;
  color: string;
  activeColor: string;
}[] = [
  { value: "present", label: "Present", icon: Check, color: "text-emerald-600", activeColor: "bg-emerald-50 ring-emerald-500 text-emerald-700" },
  { value: "late", label: "Late", icon: Timer, color: "text-amber-600", activeColor: "bg-amber-50 ring-amber-500 text-amber-700" },
  { value: "absent", label: "Absent", icon: X, color: "text-red-600", activeColor: "bg-red-50 ring-red-500 text-red-700" },
  { value: "excused", label: "Excused", icon: ShieldOff, color: "text-blue-600", activeColor: "bg-blue-50 ring-blue-500 text-blue-700" },
];

const HISTORY_STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

// ── Main page ───────────────────────────────────────────────

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Mark students as they arrive. Track class attendance history."
      />

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <TabButton
            label="Today's Classes"
            active={activeTab === "today"}
            onClick={() => setActiveTab("today")}
          />
          <TabButton
            label="History"
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          />
        </nav>
      </div>

      {activeTab === "today" ? <TodayView /> : <HistoryView />}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
      )}
    >
      {label}
    </button>
  );
}

// ── Today's Classes tab ─────────────────────────────────────

function TodayView() {
  const todaysClasses = useMemo(
    () =>
      BOOKABLE_CLASSES.filter(
        (bc) => bc.date === MOCK_TODAY && bc.classType !== "student_practice"
      ).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    []
  );

  if (todaysClasses.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No classes today"
        description="There are no scheduled classes for today."
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Showing classes for <span className="font-medium text-gray-700">{formatDate(MOCK_TODAY)}</span>
      </p>
      {todaysClasses.map((bc) => (
        <ClassAttendanceCard key={bc.id} bookableClass={bc} />
      ))}
      {/* TODO: add "Mark all unmarked as absent" bulk action */}
    </div>
  );
}

// ── Class attendance card ───────────────────────────────────

interface ClassCardProps {
  bookableClass: (typeof BOOKABLE_CLASSES)[number];
}

function ClassAttendanceCard({ bookableClass: bc }: ClassCardProps) {
  const classBookings = useMemo(
    () =>
      BOOKINGS.filter(
        (b) =>
          b.bookableClassId === bc.id &&
          b.status !== "cancelled"
      ),
    [bc.id]
  );

  const existingAttendance = useMemo(() => {
    const map = new Map<string, AttendanceMark>();
    for (const a of ATTENDANCE) {
      if (a.bookableClassId === bc.id) {
        map.set(a.studentId, a.status);
      }
    }
    return map;
  }, [bc.id]);

  const [marks, setMarks] = useState<Map<string, AttendanceMark>>(() => existingAttendance);
  const [pending, startTransition] = useTransition();
  const [penaltyAlerts, setPenaltyAlerts] = useState<Map<string, string>>(new Map());

  const summary = useMemo(() => {
    const total = classBookings.length;
    let present = 0, late = 0, absent = 0, excused = 0;
    for (const mark of marks.values()) {
      if (mark === "present") present++;
      else if (mark === "late") late++;
      else if (mark === "absent") absent++;
      else if (mark === "excused") excused++;
    }
    return { total, present, late, absent, excused, unmarked: total - present - late - absent - excused };
  }, [classBookings.length, marks]);

  const handleMark = (
    studentId: string,
    studentName: string,
    bookingId: string,
    status: AttendanceMark
  ) => {
    setMarks((prev) => new Map(prev).set(studentId, status));

    startTransition(async () => {
      const result = await markStudentAttendance({
        bookableClassId: bc.id,
        studentId,
        studentName,
        bookingId,
        classTitle: bc.title,
        date: bc.date,
        classType: bc.classType as ClassType,
        danceStyleId: bc.styleId,
        level: bc.level,
        status,
        markedBy: "Admin User",
      });

      if (result.penaltyCreated && result.penaltyDescription) {
        setPenaltyAlerts((prev) =>
          new Map(prev).set(studentId, result.penaltyDescription!)
        );
      } else {
        setPenaltyAlerts((prev) => {
          const next = new Map(prev);
          next.delete(studentId);
          return next;
        });
      }
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Card header */}
      <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{bc.title}</h3>
              {bc.styleName && <StatusBadge status={bc.classType} />}
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {bc.startTime}–{bc.endTime}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {bc.location}
              </span>
              {bc.styleName && <span>{bc.styleName}</span>}
              {bc.level && <span>· {bc.level}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <SummaryPill label="Present" count={summary.present + summary.late} variant="success" />
            <SummaryPill label="Absent" count={summary.absent} variant="danger" />
            <SummaryPill label="Unmarked" count={summary.unmarked} variant="default" />
          </div>
        </div>
      </div>

      {/* Student list */}
      {classBookings.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No bookings for this class.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {classBookings.map((booking) => {
            const currentMark = marks.get(booking.studentId);
            const alert = penaltyAlerts.get(booking.studentId);

            return (
              <li key={booking.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {booking.studentName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {booking.danceRole && <StatusBadge status={booking.danceRole} />}
                      {currentMark && (
                        <span className="text-xs text-gray-400">
                          Marked: <StatusBadge status={currentMark} />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {MARK_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = currentMark === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() =>
                            handleMark(
                              booking.studentId,
                              booking.studentName,
                              booking.id,
                              opt.value
                            )
                          }
                          disabled={pending}
                          title={opt.label}
                          className={cn(
                            "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition-all",
                            isActive
                              ? opt.activeColor
                              : "bg-white ring-gray-200 text-gray-500 hover:bg-gray-50"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {alert && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {alert}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SummaryPill({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "success" | "danger" | "default";
}) {
  const colors = {
    success: "bg-emerald-50 text-emerald-700",
    danger: "bg-red-50 text-red-700",
    default: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium", colors[variant])}>
      {count} {label}
    </span>
  );
}

// ── History tab ─────────────────────────────────────────────

function HistoryView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const dateOptions = useMemo(
    () =>
      Array.from(new Set(ATTENDANCE.map((a) => a.date)))
        .sort()
        .map((d) => ({ value: d, label: formatDate(d) })),
    []
  );

  const q = search.toLowerCase();

  const filtered = useMemo(
    () =>
      ATTENDANCE.filter((a) => {
        if (
          q &&
          !a.studentName.toLowerCase().includes(q) &&
          !a.classTitle.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (statusFilter && a.status !== statusFilter) return false;
        if (dateFilter && a.date !== dateFilter) return false;
        return true;
      }),
    [q, statusFilter, dateFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
          options={HISTORY_STATUS_OPTIONS}
          placeholder="All statuses"
        />
        <SelectFilter
          value={dateFilter}
          onChange={setDateFilter}
          options={dateOptions}
          placeholder="All dates"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance records"
          description="Attendance tracking will be available once classes and bookings are set up."
        />
      ) : (
        <AdminTable
          headers={["Student", "Class", "Date", "Status", "Method", "Marked By", "Marked At"]}
          count={filtered.length}
        >
          {filtered.map((a) => (
            <tr key={a.id}>
              <Td className="font-medium text-gray-900">{a.studentName}</Td>
              <Td>{a.classTitle}</Td>
              <Td>{formatDate(a.date)}</Td>
              <Td><StatusBadge status={a.status} /></Td>
              <Td className="capitalize">{a.checkInMethod}</Td>
              <Td>{a.markedBy}</Td>
              <Td>{a.markedAt.split("T")[1]?.substring(0, 5) ?? a.markedAt}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
