/**
 * Singleton AttendanceService instance backed by mock data.
 * In production, replace with Supabase-backed service.
 */

import {
  AttendanceService,
  type StoredAttendance,
} from "./attendance-service";
import { ATTENDANCE } from "@/lib/mock-data";

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

let instance: AttendanceService | null = null;

export function getAttendanceService(): AttendanceService {
  if (!instance) {
    instance = new AttendanceService(buildRecords());
  }
  return instance;
}
