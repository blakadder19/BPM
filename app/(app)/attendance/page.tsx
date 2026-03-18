import { requireRole } from "@/lib/auth";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { BOOKABLE_CLASSES, BOOKINGS, STUDENTS } from "@/lib/mock-data";
import { AttendanceClient } from "@/components/attendance/attendance-client";

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AttendancePage() {
  await requireRole(["admin", "teacher"]);

  const today = getToday();
  const attendanceSvc = getAttendanceService();
  const allRecords = attendanceSvc.getAllRecords();

  const todaysClasses = BOOKABLE_CLASSES.filter(
    (bc) => bc.date === today && bc.classType !== "student_practice"
  ).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const todaysClassIds = new Set(todaysClasses.map((bc) => bc.id));

  const bookings = BOOKINGS.filter(
    (b) => todaysClassIds.has(b.bookableClassId) && b.status !== "cancelled"
  );

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
    />
  );
}
