/**
 * Attendance closure logic — marks unchecked confirmed bookings as "missed"
 * after the attendance window closes.
 *
 * Pure mutation helper with no framework dependencies (no revalidatePath).
 * Safe to call during page render. Idempotent.
 */

import { getBookingService } from "@/lib/services/booking-store";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { getInstances } from "@/lib/services/schedule-store";
import { getSettings } from "@/lib/services/settings-store";
import { isAfterClosureWindow } from "@/lib/domain/datetime";

export function runAttendanceClosure(): {
  classesProcessed: number;
  bookingsMarkedMissed: number;
} {
  const bookingSvc = getBookingService();
  const instances = getInstances();
  const attendanceSvc = getAttendanceService();
  const { attendanceClosureMinutes } = getSettings();

  let classesProcessed = 0;
  let bookingsMarkedMissed = 0;

  for (const cls of instances) {
    if (!isAfterClosureWindow(cls.date, cls.startTime, attendanceClosureMinutes)) continue;

    const unchecked = bookingSvc.getUncheckedBookingsForClass(cls.id);
    if (unchecked.length === 0) continue;

    classesProcessed++;

    for (const booking of unchecked) {
      const alreadyMarked = attendanceSvc
        .getAllRecords()
        .some(
          (r) =>
            r.bookableClassId === cls.id &&
            r.studentId === booking.studentId &&
            (r.status === "present" || r.status === "late")
        );

      if (alreadyMarked) {
        bookingSvc.checkInBooking(booking.id);
        continue;
      }

      bookingSvc.markMissed(booking.id);
      bookingsMarkedMissed++;
    }
  }

  return { classesProcessed, bookingsMarkedMissed };
}
