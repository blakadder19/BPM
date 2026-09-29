"use server";

/**
 * Phase 19 — attendance CSV export.
 *
 * The row data is resolved ENTIRELY server-side. The client sends
 * filters, never rows: it has no authority over what an export may
 * contain, and it does not hold the student emails or subscription
 * details the export needs anyway.
 *
 * Joins performed here:
 *   attendance → booking (status, source)
 *   attendance → student (email)
 *   attendance → subscription (product name, credit consumed)
 *   attendance → class instance (start time, teachers)
 *
 * Anything that cannot be resolved is left as an empty cell rather
 * than guessed — see `lib/domain/attendance-export.ts`.
 */

import { requirePermission } from "@/lib/staff-permissions";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getStudentRepo, getSubscriptionRepo } from "@/lib/repositories";
import { getInstances } from "@/lib/services/schedule-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { BLOCKED_SENTINEL } from "@/lib/constants/teacher-assignment";
import { getTodayStr } from "@/lib/domain/datetime";
import {
  buildAttendanceCsv,
  buildAttendanceExportFilename,
  type AttendanceExportRow,
} from "@/lib/domain/attendance-export";

/**
 * Mirrors the filters available in Attendance → History, so "Export
 * CSV" exports exactly what the admin is looking at.
 */
export interface AttendanceExportFilters {
  /** Free-text over student name and class title. */
  search?: string;
  status?: string;
  /** Single date (what the History dropdown offers). */
  date?: string;
  /** Optional explicit range, for a term/month export. */
  dateFrom?: string;
  dateTo?: string;
  classTitle?: string;
  markedBy?: string;
}

export interface AttendanceExportResult {
  success: boolean;
  error?: string;
  filename?: string;
  csv?: string;
  rowCount?: number;
}

export async function exportAttendanceCsvAction(
  filters: AttendanceExportFilters = {},
): Promise<AttendanceExportResult> {
  // Same gate as viewing the page — an export exposes nothing the
  // History table does not already show, plus the student email,
  // which `attendance:view` holders can already reach via /students.
  await requirePermission("attendance:view");
  await ensureOperationalDataHydrated();

  const attendanceSvc = getAttendanceService();
  const bookingSvc = getBookingService();

  const [students, subscriptions] = await Promise.all([
    getStudentRepo().getAll(),
    getSubscriptionRepo().getAll(),
  ]);

  const studentById = new Map(students.map((s) => [s.id, s]));
  const subById = new Map(subscriptions.map((s) => [s.id, s]));
  const instanceById = new Map(getInstances().map((i) => [i.id, i]));
  const bookingById = new Map(bookingSvc.bookings.map((b) => [b.id, b]));

  // Teacher resolution mirrors the schedule model:
  //   1. a per-instance override, when set;
  //   2. otherwise the active teacher pair for the class template
  //      whose effective window covers the instance date.
  // The BLOCKED sentinel means "intentionally unassigned", which we
  // report as a blank cell rather than a teacher name.
  const teacherNames = buildTeacherNameMap();
  const pairs = getAssignments();

  function resolveTeachers(instanceId: string): string | null {
    const inst = instanceById.get(instanceId);
    if (!inst) return null;

    const nameOf = (id: string | null | undefined): string | null => {
      if (!id || id === BLOCKED_SENTINEL) return null;
      return teacherNames.get(id) ?? null;
    };

    const overrides = [
      nameOf(inst.teacherOverride1Id),
      nameOf(inst.teacherOverride2Id),
    ].filter(Boolean) as string[];
    if (inst.teacherOverride1Id) {
      // An override is authoritative even when it resolves to the
      // blocked sentinel — do not fall back to the template pair.
      return overrides.length > 0 ? overrides.join(", ") : null;
    }

    if (!inst.classId) return null;
    const pair = pairs.find(
      (p) =>
        p.classId === inst.classId &&
        p.isActive &&
        p.effectiveFrom <= inst.date &&
        (!p.effectiveUntil || p.effectiveUntil >= inst.date),
    );
    if (!pair) return null;

    const names = [nameOf(pair.teacher1Id), nameOf(pair.teacher2Id)].filter(
      Boolean,
    ) as string[];
    return names.length > 0 ? names.join(", ") : null;
  }

  const q = (filters.search ?? "").trim().toLowerCase();

  const matching = attendanceSvc.records.filter((r) => {
    if (
      q &&
      !r.studentName.toLowerCase().includes(q) &&
      !r.classTitle.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (filters.status && r.status !== filters.status) return false;
    if (filters.date && r.date !== filters.date) return false;
    if (filters.dateFrom && r.date < filters.dateFrom) return false;
    if (filters.dateTo && r.date > filters.dateTo) return false;
    if (filters.classTitle && r.classTitle !== filters.classTitle) return false;
    if (filters.markedBy && r.markedBy !== filters.markedBy) return false;
    return true;
  });

  // Newest first, matching the on-screen ordering.
  matching.sort(
    (a, b) => b.date.localeCompare(a.date) || b.markedAt.localeCompare(a.markedAt),
  );

  const rows: AttendanceExportRow[] = matching.map((r) => {
    const student = studentById.get(r.studentId);
    const instance = instanceById.get(r.bookableClassId);
    const booking = r.bookingId ? bookingById.get(r.bookingId) : undefined;

    // Prefer the subscription recorded on the attendance row; fall
    // back to the one on the booking, which is where a normal
    // (non-walk-in) attendance carries it.
    const subId = r.subscriptionId ?? booking?.subscriptionId ?? null;
    const sub = subId ? subById.get(subId) : undefined;

    // A credit was consumed when the attendance is tied to an
    // entitlement that actually meters usage. Unlimited memberships
    // and entitlement-free walk-ins get a blank cell rather than a
    // misleading "No".
    let creditConsumed: AttendanceExportRow["creditConsumed"] = null;
    if (sub) {
      const metered =
        sub.totalCredits !== null ||
        (sub.productType === "membership" && sub.classesPerTerm !== null);
      creditConsumed = metered ? "Yes" : "No";
    }

    return {
      date: r.date,
      classTitle: r.classTitle,
      startTime: instance?.startTime ?? null,
      teachers: resolveTeachers(r.bookableClassId),
      studentName: r.studentName,
      studentEmail: student?.email ?? null,
      attendanceStatus: r.status,
      bookingStatus: booking?.status ?? null,
      // Falls back to the attendance source (walk_in / admin) when
      // there is no booking, which is the useful value there.
      bookingSource: booking?.source ?? r.source ?? null,
      product: sub?.productName ?? null,
      creditConsumed,
      checkInMethod: r.checkInMethod ?? null,
      markedAt: r.markedAt ?? null,
      markedBy: r.markedBy ?? null,
    };
  });

  const filename = buildAttendanceExportFilename({
    classTitle: filters.classTitle ?? null,
    dateFrom: filters.dateFrom ?? filters.date ?? null,
    dateTo: filters.dateTo ?? filters.date ?? null,
    today: getTodayStr(),
  });

  return {
    success: true,
    filename,
    csv: buildAttendanceCsv(rows),
    rowCount: rows.length,
  };
}
