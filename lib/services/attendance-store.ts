/**
 * Singleton AttendanceService instance backed by mock data.
 * Uses globalThis to survive HMR module re-evaluation in Next.js dev.
 * In production, replace with Supabase-backed service.
 */

import {
  AttendanceService,
  type StoredAttendance,
} from "./attendance-service";
import { ATTENDANCE } from "@/lib/mock-data";

const STORE_VERSION = 2;

function buildRecords(): StoredAttendance[] {
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
