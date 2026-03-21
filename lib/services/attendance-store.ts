/**
 * Singleton AttendanceService instance.
 * When Supabase is configured, starts empty — hydration fills real data.
 */

import {
  AttendanceService,
  type StoredAttendance,
} from "./attendance-service";
import { ATTENDANCE } from "@/lib/mock-data";

const STORE_VERSION = 3;

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function buildRecords(): StoredAttendance[] {
  if (hasSupabaseConfig()) return [];
  return ATTENDANCE.map((a) => ({
    id: a.id,
    bookableClassId: a.bookableClassId,
    studentId: a.studentId,
    studentName: a.studentName,
    bookingId: a.bookingId,
    classTitle: a.classTitle,
    date: a.date,
    status: a.status,
    checkInMethod: a.checkInMethod,
    markedBy: a.markedBy,
    markedAt: a.markedAt,
    notes: a.notes,
  }));
}

const g = globalThis as unknown as {
  __bpm_attendanceSvc?: AttendanceService;
  __bpm_attendanceSvcV?: number;
};

export function getAttendanceService(): AttendanceService {
  if (!g.__bpm_attendanceSvc || g.__bpm_attendanceSvcV !== STORE_VERSION) {
    const existing = g.__bpm_attendanceSvc?.records;
    g.__bpm_attendanceSvc = new AttendanceService(existing ?? buildRecords());
    g.__bpm_attendanceSvcV = STORE_VERSION;

    try {
      const { resetHydrationFlags } = require("@/lib/supabase/hydrate-operational");
      resetHydrationFlags();
    } catch { /* hydration module not available */ }
  }
  return g.__bpm_attendanceSvc;
}
