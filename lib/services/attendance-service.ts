/**
 * Attendance service — manages attendance records for class instances.
 *
 * Uses an in-memory store for MVP; swap to Supabase when connected.
 *
 * TODO: QR check-in support — when implemented, callers will pass
 *       checkInMethod: "qr" instead of the default "manual".
 */

import { generateId } from "@/lib/utils";
import type { AttendanceMark, CheckInMethod } from "@/types/domain";

// ── Store types ─────────────────────────────────────────────

export interface StoredAttendance {
  id: string;
  bookableClassId: string;
  studentId: string;
  studentName: string;
  bookingId: string | null;
  classTitle: string;
  date: string;
  status: AttendanceMark;
  /** TODO: "qr" path will be used when QR check-in is added */
  checkInMethod: CheckInMethod;
  markedBy: string;
  markedAt: string;
  notes: string | null;
}

// ── Outcome ─────────────────────────────────────────────────

export type MarkOutcome =
  | { type: "created"; record: StoredAttendance }
  | { type: "updated"; record: StoredAttendance; previousStatus: AttendanceMark }
  | { type: "error"; reason: string };

export interface ClassAttendanceSummary {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unmarked: number;
}

// ── Service ─────────────────────────────────────────────────

export class AttendanceService {
  records: StoredAttendance[];

  constructor(initial: StoredAttendance[] = []) {
    this.records = [...initial];
  }

  markAttendance(params: {
    bookableClassId: string;
    studentId: string;
    studentName: string;
    bookingId: string | null;
    classTitle: string;
    date: string;
    status: AttendanceMark;
    markedBy: string;
    notes?: string | null;
    checkInMethod?: CheckInMethod;
  }): MarkOutcome {
    const existing = this.records.find(
      (r) =>
        r.bookableClassId === params.bookableClassId &&
        r.studentId === params.studentId
    );

    const now = new Date().toISOString();
    const method = params.checkInMethod ?? "manual";

    if (existing) {
      const previousStatus = existing.status;
      existing.status = params.status;
      existing.markedBy = params.markedBy;
      existing.markedAt = now;
      existing.checkInMethod = method;
      if (params.notes !== undefined) existing.notes = params.notes ?? null;
      return { type: "updated", record: existing, previousStatus };
    }

    const record: StoredAttendance = {
      id: generateId("att"),
      bookableClassId: params.bookableClassId,
      studentId: params.studentId,
      studentName: params.studentName,
      bookingId: params.bookingId,
      classTitle: params.classTitle,
      date: params.date,
      status: params.status,
      checkInMethod: method,
      markedBy: params.markedBy,
      markedAt: now,
      notes: params.notes ?? null,
    };
    this.records.push(record);
    return { type: "created", record };
  }

  getRecord(
    bookableClassId: string,
    studentId: string
  ): StoredAttendance | undefined {
    return this.records.find(
      (r) =>
        r.bookableClassId === bookableClassId && r.studentId === studentId
    );
  }

  getAttendanceForClass(bookableClassId: string): StoredAttendance[] {
    return this.records.filter(
      (r) => r.bookableClassId === bookableClassId
    );
  }

  getAttendanceForStudent(studentId: string): StoredAttendance[] {
    return this.records.filter((r) => r.studentId === studentId);
  }

  getSummary(
    bookableClassId: string,
    totalBooked: number
  ): ClassAttendanceSummary {
    const classRecords = this.getAttendanceForClass(bookableClassId);
    const present = classRecords.filter((r) => r.status === "present").length;
    const late = classRecords.filter((r) => r.status === "late").length;
    const absent = classRecords.filter((r) => r.status === "absent").length;
    const excused = classRecords.filter((r) => r.status === "excused").length;
    const marked = present + late + absent + excused;

    return {
      total: totalBooked,
      present,
      late,
      absent,
      excused,
      unmarked: Math.max(0, totalBooked - marked),
    };
  }

  getAllRecords(): StoredAttendance[] {
    return [...this.records];
  }
}
