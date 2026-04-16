"use client";

import { useState, useMemo, useEffect, useRef, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useScanSessionSafe } from "@/components/providers/scan-session-provider";
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
  ScanLine,
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
import { validateTokenCheckInAction } from "@/lib/actions/checkin";
import type { AttendanceMark, ClassType } from "@/types/domain";
import type { StoredAttendance } from "@/lib/services/attendance-service";
import { CLASS_TYPE_CONFIG } from "@/config/event-types";
import { checkStudentPracticePayment } from "@/lib/domain/student-practice-rules";
import { QrCheckInPanel } from "./qr-checkin-panel";

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

interface AttendanceClientProps {
  mockToday: string;
  todaysClasses: BookableClassProp[];
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
  allClasses: BookableClassProp[];
  isDev?: boolean;
  studentOptions?: StudentOption[];
  activeSubscriptions?: SubscriptionOption[];
  initialClassFilter?: string;
  initialDateFilter?: string;
  initialStudentSearch?: string;
  initialTab?: "qr";
  currentUserName?: string;
}

export function AttendanceClient({
  mockToday,
  todaysClasses,
  bookings,
  attendanceRecords,
  allClasses,
  isDev,
  studentOptions,
  activeSubscriptions,
  initialClassFilter,
  initialDateFilter,
  initialStudentSearch,
  initialTab,
  currentUserName,
}: AttendanceClientProps) {
  const router = useRouter();
  const scanCtx = useScanSessionSafe();
  const hasContextFilter = !!(initialClassFilter || initialStudentSearch);
  const [activeTab, setActiveTab] = useState<"today" | "qr" | "history">(
    initialTab === "qr" ? "qr" : hasContextFilter ? "history" : "today"
  );
  const [showAddAttendance, setShowAddAttendance] = useState(false);

  // Auto-switch to QR tab when a paired scan result arrives for attendance
  const scanCountRef = useRef(scanCtx?.scanCount ?? 0);
  useEffect(() => {
    if (!scanCtx) return;
    if (scanCtx.scanCount > scanCountRef.current && scanCtx.lastResult?.payload?.type === "attendance") {
      setActiveTab("qr");
    }
    scanCountRef.current = scanCtx.scanCount;
  }, [scanCtx?.scanCount, scanCtx?.lastResult, scanCtx]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Attendance"
          description="Mark students as they arrive. Track class attendance history."
        />
        <div className="flex items-center gap-2">
          <AdminHelpButton pageKey="attendance" />
          <Button onClick={() => setShowAddAttendance(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Record
          </Button>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto">
          <TabButton
            label="Today's Classes"
            active={activeTab === "today"}
            onClick={() => setActiveTab("today")}
          />
          <TabButton
            label="QR Scan"
            icon={<ScanLine className="h-3.5 w-3.5" />}
            active={activeTab === "qr"}
            onClick={() => setActiveTab("qr")}
          />
          <TabButton
            label="History"
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          />
        </nav>
      </div>

      {activeTab === "qr" ? (
        <QrCheckInPanel />
      ) : activeTab === "today" ? (
        <>
          <TokenCheckInPanel />
          <TodayView
            mockToday={mockToday}
            todaysClasses={todaysClasses}
            bookings={bookings}
            attendanceRecords={attendanceRecords}
            currentUserName={currentUserName}
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
        />
      )}

      {showAddAttendance && (
        <AddAttendanceDialog
          students={studentOptions ?? []}
          classes={allClasses}
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
}: {
  mockToday: string;
  todaysClasses: BookableClassProp[];
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
  currentUserName?: string;
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
}: {
  bookableClass: BookableClassProp;
  bookings: BookingProp[];
  attendanceRecords: StoredAttendance[];
  currentUserName?: string;
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
                    {!row.bookingId && currentMark && (
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

const SOURCE_BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  subscription: { bg: "bg-violet-50", text: "text-violet-600", label: "Subscription" },
  drop_in: { bg: "bg-teal-50", text: "text-teal-600", label: "Drop-in" },
  walk_in: { bg: "bg-bpm-50", text: "text-bpm-600", label: "Walk-in" },
  admin: { bg: "bg-gray-100", text: "text-gray-600", label: "Admin" },
};

function SourceBadge({ source }: { source: string }) {
  const style = SOURCE_BADGE_STYLES[source] ?? SOURCE_BADGE_STYLES.walk_in;
  return (
    <span className={cn("ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium", style.bg, style.text)}>
      {style.label}
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
}: {
  attendanceRecords: StoredAttendance[];
  allClasses: BookableClassProp[];
  initialSearch?: string;
  initialClassFilter?: string;
  currentUserName?: string;
  initialDateFilter?: string;
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
  currentUserName,
}: {
  record: StoredAttendance;
  bookableClass: BookableClassProp | undefined;
  onRefresh: () => void;
  currentUserName?: string;
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
      </Td>
        <Td><SourceBadge source={a.source ?? "walk_in"} /></Td>
      <Td className="capitalize">{a.checkInMethod}</Td>
      <Td>{a.markedBy}</Td>
      <Td>{a.markedAt.split("T")[1]?.substring(0, 5) ?? a.markedAt}</Td>
        <Td>
          {isDeletable && (
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
  today: todayProp,
  subscriptions,
  attendanceRecords,
  onClose,
  currentUserName,
}: {
  students: StudentOption[];
  classes: BookableClassProp[];
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

  const eligibleClasses = useMemo(
    () => classes
      .filter((c) => c.date === todayProp)
      .sort((a, b) => b.startTime.localeCompare(a.startTime)),
    [classes, todayProp]
  );

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

  const effectiveSourceOptions = useMemo(() => {
    if (!creditsApply) {
      return SOURCE_OPTIONS.filter((o) => o.value !== "subscription");
    }
    return SOURCE_OPTIONS;
  }, [creditsApply]);

  useEffect(() => {
    if (!creditsApply && source === "subscription") {
      setSource("walk_in");
      setSubscriptionId("");
    }
  }, [creditsApply, source]);

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
          <DialogTitle>Add Attendance Record</DialogTitle>
          <p className="text-xs text-gray-500">Record a walk-in, drop-in, or subscription attendance directly.</p>
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
              <Label>Class * <span className="text-xs font-normal text-gray-400">(today and past only)</span></Label>
              <select value={bookableClassId} onChange={(e) => setBookableClassId(e.target.value)} className={inputCls}>
                <option value="">Select class…</option>
                {eligibleClasses.map((c) => <option key={c.id} value={c.id}>{c.title} — {c.date} {c.startTime}</option>)}
              </select>
              {eligibleClasses.length === 0 && <p className="mt-1 text-xs text-gray-400">No eligible classes (today or past) found.</p>}
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
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
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
