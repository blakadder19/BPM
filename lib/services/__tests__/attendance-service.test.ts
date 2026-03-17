import { describe, it, expect, beforeEach } from "vitest";
import {
  AttendanceService,
  type StoredAttendance,
} from "../attendance-service";

function makeRecord(overrides: Partial<StoredAttendance> & { id: string }): StoredAttendance {
  return {
    bookableClassId: "bc-1",
    studentId: "s-1",
    studentName: "Alice",
    bookingId: "b-1",
    classTitle: "Bachata Beginner 1",
    date: "2026-03-17",
    status: "present",
    checkInMethod: "manual",
    markedBy: "Teacher",
    markedAt: "2026-03-17T19:05:00",
    notes: null,
    ...overrides,
  };
}

describe("AttendanceService", () => {
  let service: AttendanceService;

  beforeEach(() => {
    service = new AttendanceService();
  });

  describe("markAttendance — creates", () => {
    it("creates a new attendance record", () => {
      const result = service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Bachata Beginner 1",
        date: "2026-03-17",
        status: "present",
        markedBy: "Teacher",
      });

      expect(result.type).toBe("created");
      if (result.type === "created") {
        expect(result.record.status).toBe("present");
        expect(result.record.checkInMethod).toBe("manual");
        expect(result.record.studentName).toBe("Alice");
      }
    });

    it("defaults checkInMethod to manual", () => {
      const result = service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "present",
        markedBy: "Teacher",
      });

      expect(result.type).toBe("created");
      if (result.type === "created") {
        expect(result.record.checkInMethod).toBe("manual");
      }
    });

    it("respects explicit checkInMethod", () => {
      const result = service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "present",
        markedBy: "QR Scanner",
        checkInMethod: "qr",
      });

      expect(result.type).toBe("created");
      if (result.type === "created") {
        expect(result.record.checkInMethod).toBe("qr");
      }
    });

    it("stores notes when provided", () => {
      const result = service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "late",
        markedBy: "Teacher",
        notes: "Arrived 10 min late",
      });

      expect(result.type).toBe("created");
      if (result.type === "created") {
        expect(result.record.notes).toBe("Arrived 10 min late");
      }
    });
  });

  describe("markAttendance — updates", () => {
    it("updates existing record for same student+class", () => {
      service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "present",
        markedBy: "Teacher 1",
      });

      const result = service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "late",
        markedBy: "Teacher 2",
      });

      expect(result.type).toBe("updated");
      if (result.type === "updated") {
        expect(result.record.status).toBe("late");
        expect(result.record.markedBy).toBe("Teacher 2");
        expect(result.previousStatus).toBe("present");
      }

      expect(service.records).toHaveLength(1);
    });

    it("changing absent to present replaces the record", () => {
      service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "absent",
        markedBy: "Teacher",
      });

      const result = service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "present",
        markedBy: "Teacher",
      });

      expect(result.type).toBe("updated");
      if (result.type === "updated") {
        expect(result.previousStatus).toBe("absent");
        expect(result.record.status).toBe("present");
      }
    });
  });

  describe("markAttendance — multiple students", () => {
    it("tracks different students for the same class independently", () => {
      service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Test",
        date: "2026-03-17",
        status: "present",
        markedBy: "Teacher",
      });

      service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-2",
        studentName: "Bob",
        bookingId: "b-2",
        classTitle: "Test",
        date: "2026-03-17",
        status: "absent",
        markedBy: "Teacher",
      });

      expect(service.records).toHaveLength(2);
      expect(service.getRecord("bc-1", "s-1")?.status).toBe("present");
      expect(service.getRecord("bc-1", "s-2")?.status).toBe("absent");
    });

    it("same student, different classes create separate records", () => {
      service.markAttendance({
        bookableClassId: "bc-1",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-1",
        classTitle: "Class A",
        date: "2026-03-17",
        status: "present",
        markedBy: "Teacher",
      });

      service.markAttendance({
        bookableClassId: "bc-2",
        studentId: "s-1",
        studentName: "Alice",
        bookingId: "b-5",
        classTitle: "Class B",
        date: "2026-03-17",
        status: "late",
        markedBy: "Teacher",
      });

      expect(service.records).toHaveLength(2);
      expect(service.getRecord("bc-1", "s-1")?.status).toBe("present");
      expect(service.getRecord("bc-2", "s-1")?.status).toBe("late");
    });
  });

  describe("queries", () => {
    beforeEach(() => {
      service = new AttendanceService([
        makeRecord({ id: "a-1", bookableClassId: "bc-1", studentId: "s-1", status: "present" }),
        makeRecord({ id: "a-2", bookableClassId: "bc-1", studentId: "s-2", status: "absent" }),
        makeRecord({ id: "a-3", bookableClassId: "bc-1", studentId: "s-3", status: "late" }),
        makeRecord({ id: "a-4", bookableClassId: "bc-2", studentId: "s-1", status: "present", classTitle: "Cuban Beg 2" }),
      ]);
    });

    it("getAttendanceForClass returns all records for a class", () => {
      const result = service.getAttendanceForClass("bc-1");
      expect(result).toHaveLength(3);
    });

    it("getAttendanceForStudent returns all records for a student", () => {
      const result = service.getAttendanceForStudent("s-1");
      expect(result).toHaveLength(2);
    });

    it("getRecord returns specific student+class combination", () => {
      const record = service.getRecord("bc-1", "s-2");
      expect(record).toBeDefined();
      expect(record!.status).toBe("absent");
    });

    it("getRecord returns undefined for non-existent combination", () => {
      expect(service.getRecord("bc-1", "s-99")).toBeUndefined();
    });
  });

  describe("getSummary", () => {
    it("computes correct summary for a class", () => {
      service = new AttendanceService([
        makeRecord({ id: "a-1", studentId: "s-1", status: "present" }),
        makeRecord({ id: "a-2", studentId: "s-2", status: "absent" }),
        makeRecord({ id: "a-3", studentId: "s-3", status: "late" }),
        makeRecord({ id: "a-4", studentId: "s-4", status: "excused" }),
      ]);

      const summary = service.getSummary("bc-1", 6);
      expect(summary.total).toBe(6);
      expect(summary.present).toBe(1);
      expect(summary.late).toBe(1);
      expect(summary.absent).toBe(1);
      expect(summary.excused).toBe(1);
      expect(summary.unmarked).toBe(2);
    });

    it("returns all unmarked when no records exist", () => {
      const summary = service.getSummary("bc-99", 10);
      expect(summary.unmarked).toBe(10);
      expect(summary.present).toBe(0);
    });

    it("handles zero booked gracefully", () => {
      const summary = service.getSummary("bc-1", 0);
      expect(summary.total).toBe(0);
      expect(summary.unmarked).toBe(0);
    });
  });

  describe("constructor with initial data", () => {
    it("loads pre-existing records", () => {
      const initial = [
        makeRecord({ id: "a-1", studentId: "s-1" }),
        makeRecord({ id: "a-2", studentId: "s-2" }),
      ];
      service = new AttendanceService(initial);
      expect(service.getAllRecords()).toHaveLength(2);
    });

    it("does not mutate the initial array", () => {
      const initial = [makeRecord({ id: "a-1" })];
      service = new AttendanceService(initial);

      service.markAttendance({
        bookableClassId: "bc-99",
        studentId: "s-99",
        studentName: "New",
        bookingId: null,
        classTitle: "Test",
        date: "2026-03-17",
        status: "present",
        markedBy: "Teacher",
      });

      expect(initial).toHaveLength(1);
      expect(service.records).toHaveLength(2);
    });
  });
});
