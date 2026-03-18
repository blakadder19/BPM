"use client";

import { useState, useMemo, useEffect, useRef, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
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
  Plus,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, cn } from "@/lib/utils";
import { markStudentAttendance } from "@/lib/actions/attendance";
import type { AttendanceMark, ClassType } from "@/types/domain";
import type { StoredAttendance } from "@/lib/services/attendance-service";

// ── Prop types (serializable slices of mock data) ────────────

export interface BookableClassProp {
  id: string;
  classId: string | null;
  title: string;
  classType: string;
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
}

export interface BookingProp {
  id: string;
  bookableClassId: string;
  studentId: string;
  studentName: string;
  danceRole: string | null;
}

// ── Constants ────────────────────────────────────────────────

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

// ── Main client component ────────────────────────────────────

export interface StudentOption {
  id: string;
  fullName: string;
}

interface AttendanceClientProps {
  mockToday: string;
  todaysClasses: BookableClassProp[];
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
  allClasses: BookableClassProp[];
  isDev?: boolean;
  studentOptions?: StudentOption[];
}

export function AttendanceClient({
  mockToday,
  todaysClasses,
  bookings,
  attendanceRecords,
  allClasses,
  isDev,
  studentOptions,
}: AttendanceClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [showAddAttendance, setShowAddAttendance] = useState(false);
  const [clearPending, startClear] = useTransition();
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Attendance"
          description="Mark students as they arrive. Track class attendance history."
        />
        {isDev && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setClearMsg(null);
                startClear(async () => {
                  const { clearAllAttendanceAction } = await import(
                    "@/lib/actions/attendance"
                  );
                  const res = await clearAllAttendanceAction();
                  setClearMsg(
                    res.success
                      ? `Cleared ${res.cleared} attendance records`
                      : res.error ?? "Failed"
                  );
                  router.refresh();
                });
              }}
              disabled={clearPending}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {clearPending ? "Clearing…" : "Clear All"}
            </Button>
            <Button onClick={() => setShowAddAttendance(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Record
            </Button>
          </div>
        )}
      </div>

      {clearMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          <Trash2 className="h-4 w-4 flex-shrink-0" />
          <span>{clearMsg}</span>
          <button
            onClick={() => setClearMsg(null)}
            className="ml-auto text-blue-400 hover:text-blue-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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

      {activeTab === "today" ? (
        <TodayView
          mockToday={mockToday}
          todaysClasses={todaysClasses}
          bookings={bookings}
          attendanceRecords={attendanceRecords}
        />
      ) : (
        <HistoryView
          attendanceRecords={attendanceRecords}
          allClasses={allClasses}
        />
      )}

      {isDev && showAddAttendance && (
        <AddAttendanceDialog
          students={studentOptions ?? []}
          classes={allClasses}
          onClose={() => setShowAddAttendance(false)}
        />
      )}
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

function TodayView({
  mockToday,
  todaysClasses,
  bookings,
  attendanceRecords,
}: {
  mockToday: string;
  todaysClasses: BookableClassProp[];
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
}) {
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
        Showing classes for <span className="font-medium text-gray-700">{formatDate(mockToday)}</span>
      </p>
      {todaysClasses.map((bc) => (
        <ClassAttendanceCard
          key={bc.id}
          bookableClass={bc}
          bookings={bookings.filter((b) => b.bookableClassId === bc.id)}
          attendanceRecords={attendanceRecords.filter(
            (a) => a.bookableClassId === bc.id
          )}
        />
      ))}
    </div>
  );
}

// ── Class attendance card ───────────────────────────────────

interface StudentRow {
  studentId: string;
  studentName: string;
  bookingId: string | null;
  danceRole: string | null;
  isWalkIn: boolean;
}

function ClassAttendanceCard({
  bookableClass: bc,
  bookings: classBookings,
  attendanceRecords,
}: {
  bookableClass: BookableClassProp;
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
}) {
  const router = useRouter();

  const serverMarks = useMemo(() => {
    const map = new Map<string, AttendanceMark>();
    for (const a of attendanceRecords) {
      map.set(a.studentId, a.status);
    }
    return map;
  }, [attendanceRecords]);

  const studentRows: StudentRow[] = useMemo(() => {
    const bookedIds = new Set(classBookings.map((b) => b.studentId));
    const rows: StudentRow[] = classBookings.map((b) => ({
      studentId: b.studentId,
      studentName: b.studentName,
      bookingId: b.id,
      danceRole: b.danceRole,
      isWalkIn: false,
    }));
    for (const a of attendanceRecords) {
      if (!bookedIds.has(a.studentId)) {
        rows.push({
          studentId: a.studentId,
          studentName: a.studentName,
          bookingId: a.bookingId,
          danceRole: null,
          isWalkIn: true,
        });
      }
    }
    return rows;
  }, [classBookings, attendanceRecords]);

  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, AttendanceMark>>(new Map());
  const [pending, startTransition] = useTransition();
  const [penaltyAlerts, setPenaltyAlerts] = useState<Map<string, string>>(new Map());
  const cardMounted = useRef(false);

  useEffect(() => {
    if (!cardMounted.current) {
      cardMounted.current = true;
      return;
    }
    setOptimisticOverrides(new Map());
  }, [serverMarks]);

  const effectiveMarks = useMemo(() => {
    const merged = new Map(serverMarks);
    for (const [k, v] of optimisticOverrides) {
      merged.set(k, v);
    }
    return merged;
  }, [serverMarks, optimisticOverrides]);

  const summary = useMemo(() => {
    const total = studentRows.length;
    let present = 0, late = 0, absent = 0, excused = 0;
    for (const row of studentRows) {
      const mark = effectiveMarks.get(row.studentId);
      if (mark === "present") present++;
      else if (mark === "late") late++;
      else if (mark === "absent") absent++;
      else if (mark === "excused") excused++;
    }
    return { total, present, late, absent, excused, unmarked: Math.max(0, total - present - late - absent - excused) };
  }, [studentRows, effectiveMarks]);

  const handleMark = (
    studentId: string,
    studentName: string,
    bookingId: string | null,
    status: AttendanceMark
  ) => {
    setOptimisticOverrides((prev) => new Map(prev).set(studentId, status));

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

      router.refresh();
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
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

      {studentRows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No bookings for this class.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {studentRows.map((row) => {
            const currentMark = effectiveMarks.get(row.studentId);
            const alert = penaltyAlerts.get(row.studentId);

            return (
              <li key={`${row.studentId}-${row.bookingId ?? "walkin"}`} className="px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {row.studentName}
                      {row.isWalkIn && (
                        <span className="ml-2 inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                          Walk-in
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {row.danceRole && <StatusBadge status={row.danceRole} />}
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
                            handleMark(row.studentId, row.studentName, row.bookingId, opt.value)
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

function HistoryView({
  attendanceRecords,
  allClasses,
}: {
  attendanceRecords: StoredAttendance[];
  allClasses: BookableClassProp[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [markedByFilter, setMarkedByFilter] = useState("");

  const dateOptions = useMemo(
    () =>
      Array.from(new Set(attendanceRecords.map((a) => a.date)))
        .sort()
        .reverse()
        .map((d) => ({ value: d, label: formatDate(d) })),
    [attendanceRecords]
  );

  const classOptions = useMemo(
    () =>
      Array.from(new Set(attendanceRecords.map((a) => a.classTitle)))
        .sort()
        .map((t) => ({ value: t, label: t })),
    [attendanceRecords]
  );

  const markedByOptions = useMemo(
    () =>
      Array.from(new Set(attendanceRecords.map((a) => a.markedBy)))
        .sort()
        .map((m) => ({ value: m, label: m })),
    [attendanceRecords]
  );

  const classMap = useMemo(
    () => new Map(allClasses.map((bc) => [bc.id, bc])),
    [allClasses]
  );

  const q = search.toLowerCase();

  const filtered = useMemo(() => {
    const result = attendanceRecords.filter((a) => {
      if (
        q &&
        !a.studentName.toLowerCase().includes(q) &&
        !a.classTitle.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (statusFilter && a.status !== statusFilter) return false;
      if (dateFilter && a.date !== dateFilter) return false;
      if (classFilter && a.classTitle !== classFilter) return false;
      if (markedByFilter && a.markedBy !== markedByFilter) return false;
      return true;
    });

    result.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b.markedAt.localeCompare(a.markedAt);
    });

    return result;
  }, [attendanceRecords, q, statusFilter, dateFilter, classFilter, markedByFilter]);

  return (
    <div className="space-y-4">
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
          options={HISTORY_STATUS_OPTIONS}
          placeholder="All statuses"
        />
        <SelectFilter
          value={dateFilter}
          onChange={setDateFilter}
          options={dateOptions}
          placeholder="All dates"
        />
        <SelectFilter
          value={classFilter}
          onChange={setClassFilter}
          options={classOptions}
          placeholder="All classes"
        />
        <SelectFilter
          value={markedByFilter}
          onChange={setMarkedByFilter}
          options={markedByOptions}
          placeholder="All markers"
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
            <HistoryRow
              key={a.id}
              record={a}
              bookableClass={classMap.get(a.bookableClassId)}
              onRefresh={() => router.refresh()}
            />
          ))}
        </AdminTable>
      )}
    </div>
  );
}

function HistoryRow({
  record: a,
  bookableClass: bc,
  onRefresh,
}: {
  record: StoredAttendance;
  bookableClass: BookableClassProp | undefined;
  onRefresh: () => void;
}) {
  const [currentStatus, setCurrentStatus] = useState(a.status);
  const [isPending, startTransition] = useTransition();

  // Sync local state when server-delivered record status changes
  useEffect(() => {
    setCurrentStatus(a.status);
  }, [a.status]);

  function handleStatusChange(newStatus: AttendanceMark) {
    if (newStatus === currentStatus) return;
    const prev = currentStatus;
    setCurrentStatus(newStatus);

    startTransition(async () => {
      const result = await markStudentAttendance({
        bookableClassId: a.bookableClassId,
        studentId: a.studentId,
        studentName: a.studentName,
        bookingId: a.bookingId ?? "",
        classTitle: a.classTitle,
        date: a.date,
        classType: (bc?.classType ?? "class") as ClassType,
        danceStyleId: bc?.styleId ?? null,
        level: bc?.level ?? null,
        status: newStatus,
        markedBy: "Admin User",
      });

      if (!result.success) setCurrentStatus(prev);
      onRefresh();
    });
  }

  return (
    <tr className={isPending ? "opacity-60" : undefined}>
      <Td className="font-medium text-gray-900">{a.studentName}</Td>
      <Td>{a.classTitle}</Td>
      <Td>{formatDate(a.date)}</Td>
      <Td>
        <select
          value={currentStatus}
          onChange={(e) => handleStatusChange(e.target.value as AttendanceMark)}
          disabled={isPending}
          className={cn(
            "rounded-lg border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100",
            currentStatus === "present" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            currentStatus === "late" && "border-amber-200 bg-amber-50 text-amber-700",
            currentStatus === "absent" && "border-red-200 bg-red-50 text-red-700",
            currentStatus === "excused" && "border-blue-200 bg-blue-50 text-blue-700"
          )}
        >
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
          <option value="excused">Excused</option>
        </select>
      </Td>
      <Td className="capitalize">{a.checkInMethod}</Td>
      <Td>{a.markedBy}</Td>
      <Td>{a.markedAt.split("T")[1]?.substring(0, 5) ?? a.markedAt}</Td>
    </tr>
  );
}

// ── Dev-only Add Attendance Dialog ──────────────────────────

function AddAttendanceDialog({
  students,
  classes,
  onClose,
}: {
  students: StudentOption[];
  classes: BookableClassProp[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState("");
  const [bookableClassId, setBookableClassId] = useState("");
  const [status, setStatus] = useState<AttendanceMark>("present");
  const [notes, setNotes] = useState("");

  const selectedStudent = students.find((s) => s.id === studentId);
  const selectedClass = classes.find((c) => c.id === bookableClassId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId || !bookableClassId) {
      setError("Student and class are required.");
      return;
    }

    startTransition(async () => {
      const result = await markStudentAttendance({
        bookableClassId,
        studentId,
        studentName: selectedStudent?.fullName ?? "",
        bookingId: "",
        classTitle: selectedClass?.title ?? "",
        date: selectedClass?.date ?? "",
        classType: (selectedClass?.classType ?? "class") as ClassType,
        danceStyleId: selectedClass?.styleId ?? null,
        level: selectedClass?.level ?? null,
        status,
        markedBy: "Admin (dev manual)",
        notes: notes.trim() || undefined,
      });

      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to create attendance record.");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Attendance Record (Dev Only)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div>
              <Label>Student *</Label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Class *</Label>
              <select
                value={bookableClassId}
                onChange={(e) => setBookableClassId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Select class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} — {c.date} {c.startTime}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Status *</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AttendanceMark)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
              </select>
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Any dev testing notes…"
              />
            </div>

            {status === "absent" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Marking as Absent will trigger no-show penalty logic (if enabled in Settings).
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Create Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
