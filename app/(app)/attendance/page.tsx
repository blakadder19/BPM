import { requirePermission } from "@/lib/staff-permissions";
import { getAttendanceRepo, getBookingRepo } from "@/lib/repositories";
import { cachedGetAllStudents, cachedGetAllSubs } from "@/lib/server/cached-queries";
import { getTodayStr, isClassEnded } from "@/lib/domain/datetime";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getInstances } from "@/lib/services/schedule-store";
import { AttendanceClient } from "@/components/attendance/attendance-client";

const TERMINAL_STATUSES = new Set(["cancelled", "late_cancelled"]);

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ classTitle?: string; date?: string; student?: string; tab?: string }>;
}) {
  const _t0 = performance.now();
  const access = await requirePermission("attendance:view");
  const user = access.user;
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();
  const _tHydrate = performance.now();

  runAttendanceClosure();

  const today = getTodayStr();
  const attendanceSvc = getAttendanceRepo().getService();
  const allRecords = attendanceSvc.getAllRecords();
  const bookingSvc = getBookingRepo().getService();

  const allInstances = getInstances();

  const todaysClasses = allInstances.filter(
    (bc) => bc.date === today && bc.classType !== "student_practice" && !isClassEnded(bc.date, bc.endTime)
  ).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const todaysClassIds = new Set(todaysClasses.map((bc) => bc.id));

  const bookings = bookingSvc.bookings
    .filter(
      (b) => todaysClassIds.has(b.bookableClassId) && !TERMINAL_STATUSES.has(b.status)
    )
    .map((b) => ({
      id: b.id,
      bookableClassId: b.bookableClassId,
      studentId: b.studentId,
      studentName: b.studentName,
      danceRole: b.danceRole,
      status: b.status,
      source: b.source,
      subscriptionId: b.subscriptionId,
      subscriptionName: b.subscriptionName,
      adminNote: b.adminNote,
      bookedAt: b.bookedAt,
      cancelledAt: b.cancelledAt,
    }));

  const isDev = process.env.NODE_ENV === "development";

  const [allStudents, allSubs] = await Promise.all([
    cachedGetAllStudents(),
    cachedGetAllSubs(),
  ]);
  const studentOptions = allStudents.map((s) => ({ id: s.id, fullName: s.fullName }));

  const activeSubOptions = allSubs
    .filter((s) => s.status === "active")
    .map((s) => ({
      id: s.id,
      studentId: s.studentId,
      productName: s.productName,
      productType: s.productType,
      remainingCredits: s.remainingCredits,
      classesUsed: s.classesUsed,
      classesPerTerm: s.classesPerTerm,
    }));

  const _tEnd = performance.now();
  if (process.env.NODE_ENV === "development") console.info(`[perf /attendance] hydrate=${(_tHydrate-_t0).toFixed(0)}ms rest=${(_tEnd-_tHydrate).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

  return (
    <AttendanceClient
      mockToday={today}
      todaysClasses={todaysClasses}
      bookings={bookings}
      attendanceRecords={allRecords}
      allClasses={allInstances}
      isDev={isDev}
      studentOptions={studentOptions}
      activeSubscriptions={activeSubOptions}
      initialClassFilter={params.classTitle ?? ""}
      initialDateFilter={params.date ?? ""}
      initialStudentSearch={params.student ?? ""}
      currentUserName={user.fullName}
    />
  );
}
