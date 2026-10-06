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
  QrCode,
  Download,
  CalendarPlus,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
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
import { exportAttendanceCsvAction } from "@/lib/actions/attendance-export";
import {
  previewBackdatedAttendanceAction,
  backdateAttendanceAction,
  retryBackdateAuditAction,
  type BackdatePreview,
} from "@/lib/actions/attendance-backdate";
import { validateTokenCheckInAction } from "@/lib/actions/checkin";
import type { AttendanceMark, ClassType } from "@/types/domain";
import type { StoredAttendance } from "@/lib/services/attendance-service";
import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import { checkStudentPracticePayment } from "@/lib/domain/student-practice-rules";
import { describeAttendanceSource } from "@/lib/domain/attendance-source-label";
import {
  allowedManualSources,
  allowedManualStatuses,
  canOpenManualAdd,
  manualAddClassIds,
} from "@/lib/domain/manual-attendance";

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
  status?: string;
}

export interface SubscriptionOption {
  id: string;
  studentId: string;
  productName: string;
  productType: string;
  remainingCredits: number | null;
  classesUsed: number;
  classesPerTerm: number | null;
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
  { value: "excused", label: "Excused", icon: ShieldOff, color: "text-bpm-600", activeColor: "bg-blue-50 ring-bpm-500 text-bpm-700" },
];

const HISTORY_STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
];

function isAbsenceStatus(s: AttendanceMark | undefined): s is "absent" | "excused" {
  return s === "absent" || s === "excused";
}

function isPresenceStatus(s: AttendanceMark): s is "present" | "late" {
  return s === "present" || s === "late";
}

// ── Main client component ────────────────────────────────────

export interface StudentOption {
  id: string;
  fullName: string;
}

/**
 * Plain-boolean permissions resolved server-side from the current
 * staff access. Each flag corresponds 1:1 to a permission key
 * checked by the matching server action.
 */
export interface AttendanceClientPermissions {
  canMarkPresent: boolean;
  canMarkAbsent: boolean;
  canEditHistory: boolean;
  /** `checkin:manual_checkin` — add a walk-in to a class running today. */
  canManualCheckIn: boolean;
  /** `checkin:scan` or `checkin:manual_checkin` — what `validateTokenCheckInAction` accepts. */
  canTokenCheckIn: boolean;
  /** Phase 19 — `attendance:backdate`. Gates the historical correction flow. */
  canBackdate: boolean;
}

interface AttendanceClientProps {
  mockToday: string;
  todaysClasses: BookableClassProp[];
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
  allClasses: BookableClassProp[];
  /** Every class today, with whether it has ended in academy time. */
  todaysManualAddClasses: { id: string; ended: boolean }[];
  isDev?: boolean;
  studentOptions?: StudentOption[];
  activeSubscriptions?: SubscriptionOption[];
  initialClassFilter?: string;
  initialDateFilter?: string;
  initialStudentSearch?: string;
  currentUserName?: string;
  permissions: AttendanceClientPermissions;
}

export function AttendanceClient({
  mockToday,
  todaysClasses,
  bookings,
  attendanceRecords,
  allClasses,
  todaysManualAddClasses,
  isDev,
  studentOptions,
  activeSubscriptions,
  initialClassFilter,
  initialDateFilter,
  initialStudentSearch,
  currentUserName,
  permissions,
}: AttendanceClientProps) {
  const router = useRouter();
  const hasContextFilter = !!(initialClassFilter || initialStudentSearch);
  const [activeTab, setActiveTab] = useState<"today" | "history">(
    hasContextFilter ? "history" : "today"
  );
  const [showAddAttendance, setShowAddAttendance] = useState(false);
  const showManualAdd = canOpenManualAdd(permissions, todaysManualAddClasses);
  const isReadOnly =
    !permissions.canMarkPresent &&
    !permissions.canMarkAbsent &&
    !permissions.canEditHistory &&
    !permissions.canManualCheckIn &&
    !permissions.canTokenCheckIn;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Attendance"
          description="Mark students as they arrive. Track class attendance history."
        />
        <div className="flex items-center gap-2">
          <AdminHelpButton pageKey="attendance" />
          {showManualAdd && (
            <Button onClick={() => setShowAddAttendance(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add student
            </Button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You have view-only access to Attendance. Mark, edit, and delete
          actions are hidden.
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto">
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
        <>
          {permissions.canTokenCheckIn && <TokenCheckInPanel />}
          <TodayView
            mockToday={mockToday}
            todaysClasses={todaysClasses}
            bookings={bookings}
            attendanceRecords={attendanceRecords}
            currentUserName={currentUserName}
            permissions={permissions}
          />
        </>
      ) : (
        <HistoryView
          attendanceRecords={attendanceRecords}
          allClasses={allClasses}
          initialSearch={initialStudentSearch || initialClassFilter}
          initialClassFilter={initialStudentSearch ? initialClassFilter : ""}
          initialDateFilter={initialStudentSearch ? initialDateFilter : ""}
          currentUserName={currentUserName}
          studentOptions={studentOptions}
          permissions={permissions}
        />
      )}

      {showAddAttendance && showManualAdd && (
        <AddAttendanceDialog
          students={studentOptions ?? []}
          classes={allClasses}
          todaysManualAddClasses={todaysManualAddClasses}
          permissions={permissions}
          today={mockToday}
          subscriptions={activeSubscriptions ?? []}
          attendanceRecords={attendanceRecords}
          onClose={() => setShowAddAttendance(false)}
          currentUserName={currentUserName}
        />
      )}
    </div>
  );
}

function TabButton({ label, icon, active, onClick }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors flex items-center gap-1.5",
        active
          ? "border-bpm-600 text-bpm-600"
          : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Token Check-In Panel ────────────────────────────────────

function TokenCheckInPanel() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    studentName?: string;
    classTitle?: string;
    error?: string;
  } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setResult(null);
    startTransition(async () => {
      const res = await validateTokenCheckInAction(token.trim());
      setResult(res);
      if (res.success) {
        setToken("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-bpm-100 bg-bpm-50/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <QrCode className="h-4 w-4 text-bpm-600" />
        <h3 className="text-sm font-semibold text-bpm-900">QR / Token Check-In</h3>
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setResult(null);
          }}
          placeholder="Enter or scan check-in token…"
          className="flex-1 rounded-lg border border-bpm-200 bg-white px-3 py-2 text-sm font-mono placeholder:text-gray-400 focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500"
        />
        <Button type="submit" disabled={isPending || !token.trim()} size="sm">
          {isPending ? "Validating…" : "Check In"}
        </Button>
      </form>
      {result && (
        <div
          className={cn(
            "mt-2 rounded-lg px-3 py-2 text-sm",
            result.success
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          )}
        >
          {result.success
            ? `${result.studentName} checked in for ${result.classTitle}`
            : result.error}
        </div>
      )}
    </div>
  );
}

// ── Today's Classes tab ─────────────────────────────────────

function TodayView({
  mockToday,
  todaysClasses,
  bookings,
  attendanceRecords,
  currentUserName,
  permissions,
}: {
  mockToday: string;
  todaysClasses: BookableClassProp[];
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
  currentUserName?: string;
  permissions: AttendanceClientPermissions;
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
          currentUserName={currentUserName}
          permissions={permissions}
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
  source: string;
}

function ClassAttendanceCard({
  bookableClass: bc,
  bookings: classBookings,
  attendanceRecords,
  currentUserName,
  permissions,
}: {
  bookableClass: BookableClassProp;
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
  currentUserName?: string;
  permissions: AttendanceClientPermissions;
}) {
  const router = useRouter();

  const attendanceByStudent = useMemo(() => {
    const map = new Map<string, StoredAttendance>();
    for (const a of attendanceRecords) map.set(a.studentId, a);
    return map;
  }, [attendanceRecords]);

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
      source: "booking",
    }));
    for (const a of attendanceRecords) {
      if (!bookedIds.has(a.studentId)) {
        rows.push({
          studentId: a.studentId,
          studentName: a.studentName,
          bookingId: a.bookingId,
          danceRole: null,
          source: a.source ?? "walk_in",
        });
      }
    }
    return rows;
  }, [classBookings, attendanceRecords]);

  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, AttendanceMark>>(new Map());
  const [pending, startTransition] = useTransition();
  const [penaltyAlerts, setPenaltyAlerts] = useState<Map<string, string>>(new Map());
  const [creditAlerts, setCreditAlerts] = useState<Map<string, boolean>>(new Map());
  const [markErrors, setMarkErrors] = useState<Map<string, string>>(new Map());
  const cardMounted = useRef(false);

  const [reversalConfirm, setReversalConfirm] = useState<{
    studentId: string;
    studentName: string;
    bookingId: string | null;
    previousStatus: AttendanceMark | undefined;
    newStatus: AttendanceMark;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const doMark = (
    studentId: string,
    studentName: string,
    bookingId: string | null,
    status: AttendanceMark,
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
        markedBy: currentUserName ?? "Admin",
      });

      setMarkErrors((prev) => {
        const next = new Map(prev);
        if (result.success) next.delete(studentId);
        else next.set(studentId, result.error ?? "Could not mark attendance.");
        return next;
      });
      if (!result.success) {
        setOptimisticOverrides((prev) => {
          const next = new Map(prev);
          next.delete(studentId);
          return next;
        });
        return;
      }

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

      if (result.creditRestored) {
        setCreditAlerts((prev) => new Map(prev).set(studentId, true));
      } else {
        setCreditAlerts((prev) => {
          const next = new Map(prev);
          next.delete(studentId);
          return next;
        });
      }

      router.refresh();
    });
  };

  const handleMark = (
    studentId: string,
    studentName: string,
    bookingId: string | null,
    status: AttendanceMark
  ) => {
    const currentMark = effectiveMarks.get(studentId);

    if (isAbsenceStatus(currentMark) && isPresenceStatus(status)) {
      setReversalConfirm({ studentId, studentName, bookingId, previousStatus: currentMark, newStatus: status });
      return;
    }

    if (status === "excused" && currentMark !== "excused") {
      setReversalConfirm({ studentId, studentName, bookingId, previousStatus: currentMark, newStatus: status });
      return;
    }

    doMark(studentId, studentName, bookingId, status);
  };

  const handleDeleteManual = (studentId: string) => {
    setDeleteError(null);
    const record = attendanceByStudent.get(studentId);
    if (!record) return;
    startTransition(async () => {
      const { deleteAttendanceRecordAction } = await import("@/lib/actions/attendance");
      const result = await deleteAttendanceRecordAction(record.id);
      if (!result.success) {
        setDeleteError(result.error ?? "Failed to delete record.");
        return;
      }
      setDeleteConfirm(null);
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
              {(bc.classType !== "class" || bc.styleName) && <StatusBadge status={bc.classType} />}
              {bc.status === "scheduled" && (
                <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  Scheduled
                </span>
              )}
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
            const creditAlert = creditAlerts.get(row.studentId);
            const markError = markErrors.get(row.studentId);

            return (
              <li key={`${row.studentId}-${row.bookingId ?? "walkin"}`} className="px-5 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {row.studentName}
                      {row.source !== "booking" && (
                        <SourceBadge source={row.source} />
                      )}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {row.danceRole && <StatusBadge status={row.danceRole} />}
                      {currentMark && (
                        <span className="text-xs text-gray-400">
                          Marked: <StatusBadge status={currentMark} />
                        </span>
                      )}
                      {creditAlert && currentMark === "excused" && (
                        <span className="text-[10px] font-medium text-bpm-600">Credit restored</span>
                      )}
                      {creditAlert && currentMark === "absent" && (
                        <span className="text-[10px] font-medium text-amber-600">Credit refunded (absent policy)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {MARK_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isActive = currentMark === opt.value;
                      const allowedForOption =
                        opt.value === "absent"
                          ? permissions.canMarkAbsent
                          : permissions.canMarkPresent;
                      if (!allowedForOption) {
                        return isActive ? (
                          <span
                            key={opt.value}
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset",
                              opt.activeColor,
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{opt.label}</span>
                          </span>
                        ) : null;
                      }
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
                    {!row.bookingId && currentMark && permissions.canEditHistory && (
                      <button
                        onClick={() => setDeleteConfirm(row.studentId)}
                        disabled={pending}
                        title="Delete this manual attendance record"
                        className="ml-1 rounded-lg p-1.5 text-gray-400 ring-1 ring-inset ring-gray-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {markError && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {markError}
                  </div>
                )}
                {alert && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {alert}
                  </div>
                )}
                {currentMark === "excused" && creditAlert && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-xs text-bpm-700">
                    <ShieldOff className="h-3.5 w-3.5 flex-shrink-0" />
                    Credit restored — no penalty applied.
                  </div>
                )}
                {currentMark === "absent" && creditAlert && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                    <ShieldOff className="h-3.5 w-3.5 flex-shrink-0" />
                    Credit refunded — refund-on-absent setting is enabled.
                  </div>
                )}
                {deleteError && deleteConfirm === row.studentId && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    {deleteError}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {reversalConfirm && (
        <AttendanceReversalDialog
          studentName={reversalConfirm.studentName}
          previousStatus={reversalConfirm.previousStatus}
          newStatus={reversalConfirm.newStatus}
          isPending={pending}
          onConfirm={() => {
            const { studentId, studentName, bookingId, newStatus: ns } = reversalConfirm;
            setReversalConfirm(null);
            doMark(studentId, studentName, bookingId, ns);
          }}
          onCancel={() => setReversalConfirm(null)}
        />
      )}

      {deleteConfirm && attendanceByStudent.get(deleteConfirm) && (
        <DeleteAttendanceDialog
          record={attendanceByStudent.get(deleteConfirm)!}
          isPending={pending}
          error={deleteError}
          onConfirm={() => handleDeleteManual(deleteConfirm)}
          onCancel={() => { setDeleteConfirm(null); setDeleteError(null); }}
        />
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

const SOURCE_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  booking: { bg: "bg-indigo-50", text: "text-indigo-600" },
  subscription: { bg: "bg-violet-50", text: "text-violet-600" },
  drop_in: { bg: "bg-teal-50", text: "text-teal-600" },
  walk_in: { bg: "bg-bpm-50", text: "text-bpm-600" },
  admin: { bg: "bg-gray-100", text: "text-gray-600" },
  unknown: { bg: "bg-gray-100", text: "text-gray-600" },
};

function SourceBadge({ source, hasBooking }: { source?: string | null; hasBooking?: boolean }) {
  const { key, label } = describeAttendanceSource(source, hasBooking);
  const style = SOURCE_BADGE_STYLES[key] ?? SOURCE_BADGE_STYLES.unknown;
  return (
    <span className={cn("ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", style.bg, style.text)}>
      {label}
    </span>
  );
}

// ── History tab ─────────────────────────────────────────────

function HistoryView({
  attendanceRecords,
  allClasses,
  initialSearch,
  initialClassFilter,
  initialDateFilter,
  currentUserName,
  studentOptions,
  permissions,
}: {
  attendanceRecords: StoredAttendance[];
  allClasses: BookableClassProp[];
  initialSearch?: string;
  initialClassFilter?: string;
  studentOptions?: StudentOption[];
  currentUserName?: string;
  initialDateFilter?: string;
  permissions: AttendanceClientPermissions;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState(initialDateFilter ?? "");
  const [classFilter, setClassFilter] = useState(initialClassFilter ?? "");
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

  // Phase 19 — CSV export. The server re-resolves the rows from the
  // same filters, so the client never supplies data, only criteria.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showBackdate, setShowBackdate] = useState(false);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await exportAttendanceCsvAction({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        date: dateFilter || undefined,
        classTitle: classFilter || undefined,
        markedBy: markedByFilter || undefined,
      });
      if (!res.success || !res.csv || !res.filename) {
        setExportError(res.error ?? "Could not build the export.");
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

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
        {/* Phase 19 — exports exactly what is on screen. */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          className="sm:ml-auto"
        >
          {exporting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}
          Export CSV
        </Button>
        {permissions.canBackdate && (
          <Button variant="outline" size="sm" onClick={() => setShowBackdate(true)}>
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            Add past attendee
          </Button>
        )}
      </div>

      {exportError && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {exportError}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance records"
          description="Attendance tracking will be available once classes and bookings are set up."
        />
      ) : (
        <AdminTable
          headers={["Student", "Class", "Date", "Status", "Source", "Method", "Marked By", "Marked At", ""]}
          count={filtered.length}
        >
          {filtered.map((a) => (
            <HistoryRow
              key={a.id}
              record={a}
              bookableClass={classMap.get(a.bookableClassId)}
              onRefresh={() => router.refresh()}
              currentUserName={currentUserName}
              permissions={permissions}
            />
          ))}
        </AdminTable>
      )}

      {showBackdate && permissions.canBackdate && (
        <BackdateAttendanceDialog
          classes={allClasses}
          students={studentOptions ?? []}
          onClose={() => setShowBackdate(false)}
          onDone={() => {
            setShowBackdate(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function HistoryRow({
  record: a,
  bookableClass: bc,
  onRefresh,
  currentUserName,
  permissions,
}: {
  record: StoredAttendance;
  bookableClass: BookableClassProp | undefined;
  onRefresh: () => void;
  currentUserName?: string;
  permissions: AttendanceClientPermissions;
}) {
  const [currentStatus, setCurrentStatus] = useState(a.status);
  const [isPending, startTransition] = useTransition();
  const [reversalConfirm, setReversalConfirm] = useState<{
    previousStatus: AttendanceMark;
    newStatus: AttendanceMark;
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    setCurrentStatus(a.status);
  }, [a.status]);

  const isDeletable = !a.bookingId;

  function doStatusChange(newStatus: AttendanceMark) {
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
        markedBy: currentUserName ?? "Admin",
      });

      if (!result.success) setCurrentStatus(prev);
      onRefresh();
    });
  }

  function handleStatusChange(newStatus: AttendanceMark) {
    if (newStatus === currentStatus) return;

    if (isAbsenceStatus(currentStatus) && isPresenceStatus(newStatus)) {
      setReversalConfirm({ previousStatus: currentStatus, newStatus });
      return;
    }

    if (newStatus === "excused" && currentStatus !== "excused") {
      setReversalConfirm({ previousStatus: currentStatus, newStatus });
      return;
    }

    doStatusChange(newStatus);
  }

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const { deleteAttendanceRecordAction } = await import("@/lib/actions/attendance");
      const result = await deleteAttendanceRecordAction(a.id);
      if (!result.success) {
        setDeleteError(result.error ?? "Failed to delete record.");
        return;
      }
      setShowDeleteConfirm(false);
      onRefresh();
    });
  }

  return (
    <>
    <tr className={isPending ? "opacity-60" : undefined}>
      <Td className="font-medium text-gray-900">{a.studentName}</Td>
      <Td>{a.classTitle}</Td>
      <Td>{formatDate(a.date)}</Td>
      <Td>
        {permissions.canEditHistory ? (
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value as AttendanceMark)}
            disabled={isPending}
            className={cn(
              "rounded-lg border px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-bpm-100",
              currentStatus === "present" && "border-emerald-200 bg-emerald-50 text-emerald-700",
              currentStatus === "late" && "border-amber-200 bg-amber-50 text-amber-700",
              currentStatus === "absent" && "border-red-200 bg-red-50 text-red-700",
              currentStatus === "excused" && "border-blue-200 bg-blue-50 text-bpm-700"
            )}
          >
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
          </select>
        ) : (
          <StatusBadge status={currentStatus} />
        )}
      </Td>
        <Td><SourceBadge source={a.source} hasBooking={!!a.bookingId} /></Td>
      <Td className="capitalize">{a.checkInMethod}</Td>
      <Td>{a.markedBy}</Td>
      <Td>{a.markedAt.split("T")[1]?.substring(0, 5) ?? a.markedAt}</Td>
        <Td>
          {isDeletable && permissions.canEditHistory && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending}
              title="Delete this manual attendance record"
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </Td>
    </tr>

      {reversalConfirm && (
        <tr><td colSpan={9} className="p-0">
          <AttendanceReversalDialog
            studentName={a.studentName}
            previousStatus={reversalConfirm.previousStatus}
            newStatus={reversalConfirm.newStatus}
            isPending={isPending}
            onConfirm={() => {
              const ns = reversalConfirm.newStatus;
              setReversalConfirm(null);
              doStatusChange(ns);
            }}
            onCancel={() => setReversalConfirm(null)}
          />
        </td></tr>
      )}

      {showDeleteConfirm && (
        <tr><td colSpan={9} className="p-0">
          <DeleteAttendanceDialog
            record={a}
            isPending={isPending}
            error={deleteError}
            onConfirm={handleDelete}
            onCancel={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
          />
        </td></tr>
      )}

    </>
  );
}

// ── Attendance Reversal Confirmation Dialog ─────────────────

function AttendanceReversalDialog({
  studentName,
  previousStatus,
  newStatus,
  onConfirm,
  onCancel,
  isPending,
}: {
  studentName: string;
  previousStatus: AttendanceMark | undefined;
  newStatus: AttendanceMark;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const isExcusing = newStatus === "excused";
  const borderColor = isExcusing ? "border-blue-200" : "border-amber-200";
  const bgColor = isExcusing ? "bg-blue-50" : "bg-amber-50";
  const headerColor = isExcusing ? "text-blue-800" : "text-amber-800";
  const textColor = isExcusing ? "text-bpm-700" : "text-amber-700";

  return (
    <Dialog open onClose={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isExcusing ? "Confirm Excused Absence" : "Confirm Attendance Change"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-700">
            You are {previousStatus ? "changing" : "marking"} <strong>{studentName}</strong>&rsquo;s attendance
            {previousStatus ? <> from <StatusBadge status={previousStatus} /></> : null} to <StatusBadge status={newStatus} />.
          </p>

          <div className={cn("rounded-lg border p-3 space-y-2", borderColor, bgColor)}>
            <p className={cn("text-sm font-medium flex items-center gap-1.5", headerColor)}>
              <AlertTriangle className="h-4 w-4" /> Please review the following effects:
            </p>
            <ul className={cn("list-disc pl-5 text-sm space-y-1", textColor)}>
              {previousStatus === "absent" && isPresenceStatus(newStatus) && (
                <>
                  <li>The booking will be restored from <strong>Missed</strong> to <strong>Checked In</strong>.</li>
                  <li>If a no-show penalty was created, it will be voided.</li>
                  <li>If the credit was refunded (per absence policy), it will be <strong>consumed again</strong>.</li>
                </>
              )}
              {previousStatus === "excused" && isPresenceStatus(newStatus) && (
                <>
                  <li>The booking will be marked as <strong>Checked In</strong>.</li>
                  <li>The credit refunded for this excused absence will be <strong>consumed again</strong>.</li>
                </>
              )}
              {isExcusing && (
                <>
                  <li><strong>If a subscription credit was consumed, it will be restored.</strong></li>
                  <li>No penalty will be applied.</li>
                  {previousStatus === "absent" && <li>Any existing no-show penalty for this class will be voided.</li>}
                </>
              )}
              {newStatus === "absent" && (
                <li>Absent will trigger no-show penalty logic. Credit refund depends on the <em>Refund on Absent</em> setting.</li>
              )}
              <li>The attendance record will be updated to <strong>{newStatus}</strong>.</li>
            </ul>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Updating…" : isExcusing ? "Confirm — Excuse & Restore Credit" : "Confirm Change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Attendance Confirmation Dialog ────────────────────

function DeleteAttendanceDialog({
  record,
  isPending,
  error,
  onConfirm,
  onCancel,
}: {
  record: StoredAttendance;
  isPending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const hasSubscription = record.source === "subscription" && !!record.subscriptionId;
  const wasConsumed = record.status === "present" || record.status === "late";

  return (
    <Dialog open onClose={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Attendance Record</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm text-gray-700">
            Delete the attendance record for <strong>{record.studentName}</strong> in <strong>{record.classTitle}</strong> ({formatDate(record.date)})?
          </p>

          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> This action cannot be undone.
            </p>
            <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
              <li>The attendance record will be permanently removed.</li>
              {hasSubscription && wasConsumed && (
                <li>The credit consumed from the subscription will be <strong>restored</strong>.</li>
              )}
              {hasSubscription && !wasConsumed && (
                <li>No credit adjustment needed (credit was not consumed for this status).</li>
              )}
            </ul>
          </div>
          {error && (
            <p className="rounded-lg border border-red-300 bg-red-100 p-2 text-sm text-red-800">{error}</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending} className="bg-red-600 hover:bg-red-700">
            {isPending ? "Deleting…" : "Delete Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Attendance Dialog ───────────────────────────────────

type AttendanceSource = "subscription" | "drop_in" | "walk_in" | "admin";

const SOURCE_OPTIONS: { value: AttendanceSource; label: string; hint: string }[] = [
  { value: "subscription", label: "Subscription", hint: "Consume a credit from an active subscription" },
  { value: "drop_in", label: "Drop-in", hint: "No credit consumed — pay at reception" },
  { value: "walk_in", label: "Walk-in", hint: "Attendance-only record, no booking created" },
  { value: "admin", label: "Admin / Manual", hint: "Admin override, no credit consumed" },
];

function AddAttendanceDialog({
  students,
  classes,
  todaysManualAddClasses,
  permissions,
  today: todayProp,
  subscriptions,
  attendanceRecords,
  onClose,
  currentUserName,
}: {
  students: StudentOption[];
  classes: BookableClassProp[];
  todaysManualAddClasses: { id: string; ended: boolean }[];
  permissions: AttendanceClientPermissions;
  today: string;
  subscriptions: SubscriptionOption[];
  attendanceRecords: StoredAttendance[];
  onClose: () => void;
  currentUserName?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState("");
  const [bookableClassId, setBookableClassId] = useState("");
  const [source, setSource] = useState<AttendanceSource>("walk_in");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [status, setStatus] = useState<AttendanceMark>("present");
  const [notes, setNotes] = useState("");

  const eligibleClasses = useMemo(() => {
    const ids = new Set(manualAddClassIds(permissions, todaysManualAddClasses));
    return classes
      .filter((c) => c.date === todayProp && ids.has(c.id))
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  }, [classes, todayProp, permissions, todaysManualAddClasses]);

  const studentSubs = useMemo(
    () => subscriptions.filter((s) => s.studentId === studentId),
    [subscriptions, studentId]
  );

  const selectedStudent = students.find((s) => s.id === studentId);
  const selectedClass = eligibleClasses.find((c) => c.id === bookableClassId);
  const selectedSub = studentSubs.find((s) => s.id === subscriptionId);

  const classTypeConf = selectedClass
    ? CLASS_TYPE_CONFIG[selectedClass.classType as ClassType]
    : null;
  const creditsApply = classTypeConf?.creditsApply ?? true;

  const classEnded = !!selectedClass && todaysManualAddClasses.some((c) => c.id === selectedClass.id && c.ended);
  const statusOptions = useMemo(
    () => allowedManualStatuses(permissions, classEnded),
    [permissions, classEnded]
  );
  const allowedSources = useMemo(
    () => allowedManualSources(permissions, classEnded, status),
    [permissions, classEnded, status]
  );

  useEffect(() => {
    if (statusOptions.length > 0 && !statusOptions.includes(status)) setStatus(statusOptions[0]);
  }, [statusOptions, status]);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const classTypeByInstanceId = useMemo(
    () => new Map(classes.map((c) => [c.id, c.classType])),
    [classes]
  );

  const practiceCheck = useMemo(() => {
    if (!selectedClass || selectedClass.classType !== "student_practice" || !studentId) {
      return null;
    }
    const sameDayAttended = attendanceRecords
      .filter(
        (a) =>
          a.studentId === studentId &&
          a.date === selectedClass.date &&
          (a.status === "present" || a.status === "late")
      )
      .map((a) => a.bookableClassId);

    return checkStudentPracticePayment(
      studentId,
      selectedClass.date,
      sameDayAttended,
      classTypeByInstanceId
    );
  }, [studentId, selectedClass, attendanceRecords, classTypeByInstanceId]);

  useEffect(() => {
    setPaymentConfirmed(false);
  }, [studentId, bookableClassId]);

  const effectiveSourceOptions = useMemo(
    () => SOURCE_OPTIONS.filter(
      (o) => allowedSources.includes(o.value) && (creditsApply || o.value !== "subscription")
    ),
    [creditsApply, allowedSources]
  );

  useEffect(() => {
    if (!effectiveSourceOptions.some((o) => o.value === source)) {
      setSource("walk_in");
      setSubscriptionId("");
    }
  }, [effectiveSourceOptions, source]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId || !bookableClassId) {
      setError("Student and class are required.");
      return;
    }
    if (source === "subscription" && !subscriptionId) {
      setError("Please select a subscription to consume from.");
      return;
    }

    startTransition(async () => {
      const result = await markStudentAttendance({
        bookableClassId,
        studentId,
        studentName: selectedStudent?.fullName ?? "",
        bookingId: null,
        classTitle: selectedClass?.title ?? "",
        date: selectedClass?.date ?? "",
        classType: (selectedClass?.classType ?? "class") as ClassType,
        danceStyleId: selectedClass?.styleId ?? null,
        level: selectedClass?.level ?? null,
        status,
        markedBy: `${currentUserName ?? "Admin"} (manual)`,
        notes: notes.trim() || undefined,
        attendanceSource: source,
        directSubscriptionId: source === "subscription" ? subscriptionId : null,
      });

      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to create attendance record.");
      }
    });
  }

  const inputCls = "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500";

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add student to class</DialogTitle>
          <p className="text-xs text-gray-500">Check in a walk-in, drop-in, or subscription student for a class today.</p>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <div>
              <Label>Student *</Label>
              <select value={studentId} onChange={(e) => { setStudentId(e.target.value); setSubscriptionId(""); }} className={inputCls}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>

            <div>
              <Label>Class * <span className="text-xs font-normal text-gray-400">(today only)</span></Label>
              <select value={bookableClassId} onChange={(e) => setBookableClassId(e.target.value)} className={inputCls}>
                <option value="">Select class…</option>
                {eligibleClasses.map((c) => <option key={c.id} value={c.id}>{c.title} — {c.date} {c.startTime}</option>)}
              </select>
              {eligibleClasses.length === 0 && <p className="mt-1 text-xs text-gray-400">No classes available today.</p>}
              {selectedClass && selectedClass.classType !== "class" && selectedClass.classType !== "student_practice" && (
                <div className="mt-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <span className="font-medium">{classTypeConf?.label ?? selectedClass.classType}</span>
                  {" — Socials do not consume credits, generate penalties, or require bookings."}
                </div>
              )}
              {practiceCheck && practiceCheck.requiresPayment && (
                <div className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Payment Required
                  </p>
                  <p className="mt-1">{practiceCheck.reason}</p>
                  <label className="mt-2 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={paymentConfirmed}
                      onChange={(e) => setPaymentConfirmed(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-medium">I confirm payment has been collected</span>
                  </label>
                </div>
              )}
              {practiceCheck && !practiceCheck.requiresPayment && (
                <div className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <span className="font-medium">Student Practice — Free entry. </span>
                  {practiceCheck.reason}
                </div>
              )}
            </div>

            <div>
              <Label>Source *</Label>
              <select value={source} onChange={(e) => { setSource(e.target.value as AttendanceSource); setSubscriptionId(""); }} className={inputCls}>
                {effectiveSourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500">{SOURCE_OPTIONS.find((o) => o.value === source)?.hint}</p>
            </div>

            {source === "subscription" && studentId && (
              <div>
                <Label>Subscription *</Label>
                {studentSubs.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-600">No active subscriptions for this student.</p>
                ) : (
                  <select value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} className={inputCls}>
                    <option value="">Select subscription…</option>
                    {studentSubs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.productName}
                        {s.remainingCredits !== null ? ` (${s.remainingCredits} credits left)` : s.classesPerTerm !== null ? ` (${s.classesPerTerm - s.classesUsed} classes left)` : ""}
                  </option>
                ))}
              </select>
                )}
                {selectedSub && creditsApply && (
                  <p className="mt-1 text-xs text-bpm-600">
                    1 credit will be consumed from {selectedSub.productName}.
                  </p>
                )}
                {selectedSub && !creditsApply && (
                  <p className="mt-1 text-xs text-gray-500">
                    No credit will be consumed — {classTypeConf?.label} events do not use credits.
                  </p>
                )}
            </div>
            )}

            <div>
              <Label>Status *</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value as AttendanceMark)} className={inputCls}>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{MARK_OPTIONS.find((o) => o.value === s)?.label ?? s}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>{status === "excused" ? "Excuse Reason (optional)" : "Notes (optional)"}</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inputCls}
                placeholder={status === "excused" ? "Reason for excused absence…" : "Optional notes…"}
              />
            </div>

            {status === "absent" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Marking as Absent will trigger no-show penalty logic (if enabled in Settings).
                {source === "subscription" && " The credit consumed from the subscription will NOT be refunded (unless the refund-on-absent setting is enabled)."}
              </p>
            )}
            {status === "excused" && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <ShieldOff className="h-3.5 w-3.5" /> Credit will be restored
                </p>
                <p>No penalty will be applied.</p>
                {source === "subscription" && selectedSub && (
                  <p>The credit consumed from <strong>{selectedSub.productName}</strong> will be given back.</p>
                )}
                <p className="text-bpm-600">By saving, you confirm this absence is excused.</p>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button
              type="submit"
              disabled={isPending || (practiceCheck?.requiresPayment && !paymentConfirmed)}
            >
              {isPending ? "Saving…" : "Create Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Backdated attendance correction (Phase 19) ──────────────

/**
 * Super-Admin-only historical correction.
 *
 * Three steps rather than one form, because the middle step is the
 * whole point: the admin must SEE which entitlements were valid on
 * the class date, and pick one, before anything is written. A
 * single-shot form would hide the decision that actually matters.
 *
 * Everything shown here is resolved server-side by
 * `previewBackdatedAttendanceAction`; the submit re-resolves and
 * re-validates, so nothing on screen is trusted as input.
 */
function BackdateAttendanceDialog({
  classes,
  students,
  onClose,
  onDone,
}: {
  classes: BookableClassProp[];
  students: StudentOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<BackdatePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);
  const [auditRetry, setAuditRetry] = useState<{
    bookingId: string;
    attendanceId: string;
    auditEntryId: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only classes that have already happened and were not cancelled —
  // a future class belongs in the normal booking flow.
  const pastClasses = useMemo(
    () =>
      classes
        .filter((c) => c.date <= today && c.status !== "cancelled")
        .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
        .slice(0, 300),
    [classes, today],
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const list = q
      ? students.filter((s) => s.fullName.toLowerCase().includes(q))
      : students;
    return list.slice(0, 50);
  }, [students, studentSearch]);

  // Re-resolve whenever the pair changes, so the entitlement list can
  // never belong to a different student or class than the one shown.
  useEffect(() => {
    if (!classId || !studentId) {
      setPreview(null);
      setSubscriptionId("");
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setError(null);
    previewBackdatedAttendanceAction({ bookableClassId: classId, studentId })
      .then((r) => {
        if (cancelled) return;
        if (!r.success || !r.preview) {
          setPreview(null);
          setError(r.error ?? "Could not load this class.");
          return;
        }
        setPreview(r.preview);
        // Preselect when there is only one option — no decision to make.
        setSubscriptionId(
          r.preview.candidates.length === 1 ? r.preview.candidates[0].subscriptionId : "",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, studentId]);

  const needsEntitlementChoice =
    !!preview && !preview.attendanceOnly && preview.candidates.length > 1;
  const canSubmit =
    !!classId &&
    !!studentId &&
    !!preview &&
    !preview.blockedReason &&
    reason.trim().length > 0 &&
    (!needsEntitlementChoice || !!subscriptionId) &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await backdateAttendanceAction({
        bookableClassId: classId,
        studentId,
        subscriptionId: subscriptionId || null,
        reason: reason.trim(),
      });
      if (!r.success) {
        setError(r.error ?? "Could not apply the correction.");
        return;
      }
      // The correction is committed at this point. An unsaved audit
      // entry must not be reported as a clean success, and re-running
      // the correction is the wrong remedy — keep the dialog open
      // showing what happened instead of closing on a green path.
      if (r.auditWarning) {
        setAuditWarning(r.auditWarning);
        setAuditRetry(
          r.auditPersisted === false && r.bookingId && r.attendanceId && r.auditEntryId
            ? { bookingId: r.bookingId, attendanceId: r.attendanceId, auditEntryId: r.auditEntryId }
            : null,
        );
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the correction.");
    } finally {
      setSubmitting(false);
    }
  }

  // Re-writes only the audit entry; the correction itself is never re-run.
  async function handleRetryAudit() {
    if (!auditRetry) return;
    setSubmitting(true);
    try {
      const r = await retryBackdateAuditAction(auditRetry);
      if (r.success) {
        onDone();
        return;
      }
      setAuditWarning(r.error ?? "The audit entry could not be saved.");
    } catch (err) {
      setAuditWarning(err instanceof Error ? err.message : "The audit entry could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add past attendee</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <p className="text-xs text-gray-500">
              Records that a student attended a class that has already finished.
              Creates the booking they never made, consumes one credit from a
              membership or pass that was valid on the class date, and marks
              them present.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="bd-class">Class</Label>
              <select
                id="bd-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">Select a past class</option>
                {pastClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatDate(c.date)} · {c.startTime} · {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bd-student">Student</Label>
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <select
                id="bd-student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="">Select a student</option>
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>

            {loadingPreview && (
              <p className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking entitlements for the class date…
              </p>
            )}

            {preview && !loadingPreview && (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                {preview.existingAttendance && (
                  <p className="text-sm text-gray-700">
                    Current attendance:{" "}
                    <strong>{preview.existingAttendance.status}</strong>
                    {preview.existingAttendance.status === "present"
                      ? " — already recorded, submitting will make no changes."
                      : " — this will be changed to present."}
                  </p>
                )}

                {/* Phase 19.1 — an existing booking does NOT prove the
                    credit is still spent. Cancelled / late-cancelled /
                    missed bookings had theirs restored, so the note
                    comes from the server-side classification. */}
                {preview.existingBooking && (
                  <p className="text-sm text-gray-700">
                    Existing booking:{" "}
                    <strong>{preview.existingBooking.status}</strong>
                    {preview.existingBooking.subscriptionName
                      ? ` · ${preview.existingBooking.subscriptionName}`
                      : ""}
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {preview.existingBooking.note}
                    </span>
                  </p>
                )}

                {preview.attendanceOnly ? (
                  <p className="text-sm text-gray-700">
                    This correction will only record attendance — no second
                    credit will be taken.
                  </p>
                ) : preview.blockedReason ? (
                  <p className="text-sm text-red-700">{preview.blockedReason}</p>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="bd-sub">Membership or pass to use</Label>
                    <select
                      id="bd-sub"
                      value={subscriptionId}
                      onChange={(e) => setSubscriptionId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      {preview.candidates.length > 1 && (
                        <option value="">Select which to use</option>
                      )}
                      {preview.candidates.map((c) => (
                        <option key={c.subscriptionId} value={c.subscriptionId}>
                          {c.productName}
                          {c.isUnlimited
                            ? " · unlimited"
                            : ` · ${c.remainingAsOf} left`}
                          {c.hasSinceExpired ? " · expired since" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500">
                      Valid on {formatDate(preview.classDate)}. One credit will
                      be consumed.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="bd-reason">Reason *</Label>
              <textarea
                id="bd-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                required
                placeholder="e.g. Student attended without booking — corrected next day."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500">
                Recorded in the audit trail with your name and the credit
                balance before and after.
              </p>
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {auditWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="font-medium">Applied, but not fully audited</p>
                <p className="mt-1">{auditWarning}</p>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={auditWarning ? onDone : onClose}
              disabled={submitting}
            >
              {auditWarning ? "Close" : "Cancel"}
            </Button>
            {!auditWarning && (
              <Button type="submit" disabled={!canSubmit}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Record attendance
              </Button>
            )}
            {auditWarning && auditRetry && (
              <Button type="button" onClick={handleRetryAudit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Retry audit
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
