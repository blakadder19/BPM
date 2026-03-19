/**
 * Attendance repository interface.
 *
 * Wraps the AttendanceService. In-memory delegates to the existing class.
 */

import type { AttendanceService } from "@/lib/services/attendance-service";

export interface IAttendanceRepository {
  getService(): AttendanceService;
}
