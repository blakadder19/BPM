import { requireRole } from "@/lib/auth";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getTodayStr } from "@/lib/domain/datetime";
import { closeAttendanceForPastClasses } from "@/lib/actions/attendance";
import { BOOKABLE_CLASSES, STUDENTS } from "@/lib/mock-data";
import { AttendanceClient } from "@/components/attendance/attendance-client";

const TERMINAL_STATUSES = new Set(["cancelled", "late_cancelled", "missed"]);

export default async function AttendancePage({
  searchParams,
}: {
  searchParams?: Promise<{ classTitle?: string; date?: string; student?: string }>;
}) {
  await requireRole(["admin", "teacher"]);
  const params = searchParams ? await searchParams : {};

  await closeAttendanceForPastClasses();

  const today = getTodayStr();
  const attendanceSvc = getAttendanceService();
  const allRecords = attendanceSvc.getAllRecords();
  const bookingSvc = getBookingService();

  const todaysClasses = BOOKABLE_CLASSES.filter(
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

  const studentOptions = isDev
    ? STUDENTS.map((s) => ({ id: s.id, fullName: s.fullName }))
    : [];

  return (
    <AttendanceClient
      mockToday={today}
      todaysClasses={todaysClasses}
      bookings={bookings}
      attendanceRecords={allRecords}
      allClasses={BOOKABLE_CLASSES}
      isDev={isDev}
      studentOptions={studentOptions}
      initialClassFilter={params.classTitle ?? ""}
      initialDateFilter={params.date ?? ""}
      initialStudentSearch={params.student ?? ""}
    />
  );
}
