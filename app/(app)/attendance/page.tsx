import { requireRole } from "@/lib/auth";
import { getAttendanceRepo, getBookingRepo, getStudentRepo } from "@/lib/repositories";
import { getTodayStr } from "@/lib/domain/datetime";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getInstances } from "@/lib/services/schedule-store";
import { AttendanceClient } from "@/components/attendance/attendance-client";

const TERMINAL_STATUSES = new Set(["cancelled", "late_cancelled"]);

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ classTitle?: string; date?: string; student?: string }>;
}) {
  const user = await requireRole(["admin", "teacher"]);
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();

  runAttendanceClosure();

  const today = getTodayStr();
  const attendanceSvc = getAttendanceRepo().getService();
  const allRecords = attendanceSvc.getAllRecords();
  const bookingSvc = getBookingRepo().getService();

  const allInstances = getInstances();

  const todaysClasses = allInstances.filter(
    (bc) => bc.date === today && bc.classType !== "student_practice"
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

  const allStudents = await getStudentRepo().getAll();
  const studentOptions = allStudents.map((s) => ({ id: s.id, fullName: s.fullName }));

  return (
    <AttendanceClient
      mockToday={today}
      todaysClasses={todaysClasses}
      bookings={bookings}
      attendanceRecords={allRecords}
      allClasses={allInstances}
      isDev={isDev}
      studentOptions={studentOptions}
      initialClassFilter={params.classTitle ?? ""}
      initialDateFilter={params.date ?? ""}
      initialStudentSearch={params.student ?? ""}
      currentUserName={user.fullName}
    />
  );
}
