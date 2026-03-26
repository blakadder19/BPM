/**
 * Supabase-backed AttendanceRepository.
 *
 * Attendance uses the operational-persistence + hydration pattern:
 * data is loaded from op_attendance into the in-memory AttendanceService
 * on first access, and mutations are written through to Supabase via
 * saveAttendanceToDB / deleteAttendanceFromDB in server actions.
 *
 * This repo returns the hydrated in-memory service so that
 * DATA_PROVIDER=supabase resolves correctly.
 */

import type { IAttendanceRepository } from "../interfaces/attendance-repository";
import type { AttendanceService } from "@/lib/services/attendance-service";
import { getAttendanceService } from "@/lib/services/attendance-store";

export const supabaseAttendanceRepo: IAttendanceRepository = {
  getService(): AttendanceService {
    return getAttendanceService();
  },
};
