/**
 * Integration tests for the booking lifecycle.
 *
 * Wires BookingService + AttendanceService together (no mocks)
 * to exercise full flows: book → check-in, book → cancel → promote,
 * social/student_practice rejection, and role-balance enforcement.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  BookingService,
  type ClassSnapshot,
} from "@/lib/services/booking-service";
import { AttendanceService } from "@/lib/services/attendance-service";

// ── Factories ───────────────────────────────────────────────

function makePartnerClass(id: string, overrides: Partial<ClassSnapshot> = {}): ClassSnapshot {
  return {
    id,
    title: "Bachata Beginner 1",
    classType: "class",
    styleName: "Bachata",
    danceStyleRequiresBalance: true,
    status: "open",
    date: "2026-03-23",
    startTime: "19:00",
    endTime: "20:00",
    maxCapacity: 4,
    leaderCap: 2,
    followerCap: 2,
    location: "Studio A",
    ...overrides,
  };
}

function makeSoloClass(id: string): ClassSnapshot {
  return {
    id,
    title: "Reggaeton Open",
    classType: "class",
    styleName: "Reggaeton",
    danceStyleRequiresBalance: false,
    status: "open",
    date: "2026-03-23",
    startTime: "20:00",
    endTime: "21:00",
    maxCapacity: 3,
    leaderCap: null,
    followerCap: null,
    location: "Studio B",
  };
}

function makeSocialEvent(id: string): ClassSnapshot {
  return {
    id,
    title: "Friday Social",
    classType: "social",
    styleName: null,
    danceStyleRequiresBalance: false,
    status: "open",
    date: "2026-03-23",
    startTime: "21:00",
    endTime: "23:00",
    maxCapacity: null,
    leaderCap: null,
    followerCap: null,
    location: "Main Hall",
  };
}

function makeStudentPractice(id: string): ClassSnapshot {
  return {
    id,
    title: "Practice Session",
    classType: "student_practice",
    styleName: null,
    danceStyleRequiresBalance: false,
    status: "open",
    date: "2026-03-23",
    startTime: "17:00",
    endTime: "18:00",
    maxCapacity: null,
    leaderCap: null,
    followerCap: null,
    location: "Studio C",
  };
}

// ── Tests ───────────────────────────────────────────────────

describe("Booking Lifecycle — Social & Student Practice Exclusion", () => {
  let svc: BookingService;

  beforeEach(() => {
    svc = new BookingService([], [], [
      makePartnerClass("bc-partner"),
      makeSoloClass("bc-solo"),
      makeSocialEvent("bc-social"),
      makeStudentPractice("bc-practice"),
    ]);
  });

  it("rejects booking for a social event", () => {
    const result = svc.bookClass({
      bookableClassId: "bc-social",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    expect(result.type).toBe("rejected");
    if (result.type === "rejected") {
      expect(result.reason).toContain("not bookable");
    }
  });

  it("rejects booking for student_practice when configured non-bookable", () => {
    const result = svc.bookClass({
      bookableClassId: "bc-practice",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    expect(result.type).toBe("rejected");
  });

  it("social event creates no bookings or waitlist entries", () => {
    svc.bookClass({ bookableClassId: "bc-social", studentId: "s-1", studentName: "A", danceRole: null });
    expect(svc.getConfirmedBookingsForClass("bc-social")).toHaveLength(0);
    expect(svc.getWaitlistForClass("bc-social")).toHaveLength(0);
  });

  it("confirms booking for a regular class", () => {
    const result = svc.bookClass({
      bookableClassId: "bc-solo",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    expect(result.type).toBe("confirmed");
  });

  it("rejects booking for a closed class", () => {
    const closedSvc = new BookingService([], [], [
      makePartnerClass("bc-closed", { status: "closed" }),
    ]);
    const result = closedSvc.bookClass({
      bookableClassId: "bc-closed",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: "leader",
    });
    expect(result.type).toBe("rejected");
    if (result.type === "rejected") {
      expect(result.reason).toContain("not open");
    }
  });
});

describe("Booking Lifecycle — Check-In Flow", () => {
  let bookingSvc: BookingService;
  let attendanceSvc: AttendanceService;

  beforeEach(() => {
    bookingSvc = new BookingService([], [], [makeSoloClass("bc-solo")]);
    attendanceSvc = new AttendanceService();
  });

  it("transitions confirmed booking to checked_in", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-solo",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    const result = bookingSvc.checkInBooking(b.bookingId);
    expect(result.type).toBe("checked_in");

    const active = bookingSvc.getConfirmedBookingsForClass("bc-solo");
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("checked_in");
  });

  it("checked_in bookings still count toward capacity", () => {
    for (let i = 1; i <= 3; i++) {
      const b = bookingSvc.bookClass({
        bookableClassId: "bc-solo",
        studentId: `s-${i}`,
        studentName: `Student ${i}`,
        danceRole: null,
      });
      if (b.type === "confirmed") bookingSvc.checkInBooking(b.bookingId);
    }

    const result = bookingSvc.bookClass({
      bookableClassId: "bc-solo",
      studentId: "s-4",
      studentName: "Student 4",
      danceRole: null,
    });
    expect(result.type).toBe("waitlisted");
  });

  it("is idempotent — re-checking-in already checked_in succeeds", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-solo",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    bookingSvc.checkInBooking(b.bookingId);
    const result = bookingSvc.checkInBooking(b.bookingId);
    expect(result.type).toBe("checked_in");
  });

  it("rejects check-in for cancelled booking", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-solo",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    bookingSvc.cancelBooking(b.bookingId);
    const result = bookingSvc.checkInBooking(b.bookingId);
    expect(result.type).toBe("error");
  });

  it("rejects check-in for non-existent booking", () => {
    expect(bookingSvc.checkInBooking("nonexistent").type).toBe("error");
  });

  it("attendance mark + check-in keeps booking active", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-solo",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    attendanceSvc.markAttendance({
      bookableClassId: "bc-solo",
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      classTitle: "Reggaeton Open",
      date: "2026-03-23",
      status: "present",
      markedBy: "Teacher",
    });

    bookingSvc.checkInBooking(b.bookingId);

    const active = bookingSvc.getConfirmedBookingsForClass("bc-solo");
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("checked_in");
  });
});

describe("Booking Lifecycle — Role Balance & Waitlist Promotion", () => {
  let svc: BookingService;

  beforeEach(() => {
    svc = new BookingService([], [], [
      makePartnerClass("bc-partner"),
      makeSoloClass("bc-solo"),
    ]);
  });

  it("requires role for partner class, rejects without it", () => {
    const result = svc.bookClass({
      bookableClassId: "bc-partner",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    expect(result.type).toBe("rejected");
    if (result.type === "rejected") {
      expect(result.reason).toContain("Role selection required");
    }
  });

  it("does NOT require role for non-partner class", () => {
    const result = svc.bookClass({
      bookableClassId: "bc-solo",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: null,
    });
    expect(result.type).toBe("confirmed");
  });

  it("waitlists when leader cap is reached", () => {
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-1", studentName: "L1", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-2", studentName: "L2", danceRole: "leader" });

    const result = svc.bookClass({
      bookableClassId: "bc-partner",
      studentId: "s-3",
      studentName: "L3",
      danceRole: "leader",
    });
    expect(result.type).toBe("waitlisted");
  });

  it("promotes same-role waitlisted student when that role cancels", () => {
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-1", studentName: "L1", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-2", studentName: "L2", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-3", studentName: "F1", danceRole: "follower" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-4", studentName: "F2", danceRole: "follower" });

    const wl = svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-5", studentName: "L3", danceRole: "leader" });
    expect(wl.type).toBe("waitlisted");

    const leaderBooking = svc.bookings.find((b) => b.studentId === "s-1" && b.status === "confirmed")!;
    const cancel = svc.cancelBooking(leaderBooking.id);

    expect(cancel.type).toBe("cancelled");
    if (cancel.type === "cancelled") {
      expect(cancel.promoted).not.toBeNull();
      expect(cancel.promoted!.studentName).toBe("L3");
    }

    expect(svc.getWaitlistForClass("bc-partner")).toHaveLength(0);
    expect(svc.getConfirmedBookingsForClass("bc-partner").some((b) => b.studentId === "s-5")).toBe(true);
  });

  it("does NOT promote opposite-role waitlisted student", () => {
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-1", studentName: "L1", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-2", studentName: "L2", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-3", studentName: "F1", danceRole: "follower" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-4", studentName: "F2", danceRole: "follower" });

    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-5", studentName: "F3", danceRole: "follower" });

    const leaderBooking = svc.bookings.find((b) => b.studentId === "s-1" && b.status === "confirmed")!;
    const cancel = svc.cancelBooking(leaderBooking.id);

    if (cancel.type === "cancelled") {
      expect(cancel.promoted).toBeNull();
    }
    expect(svc.getWaitlistForClass("bc-partner")).toHaveLength(1);
  });

  it("non-partner class promotes any waitlisted student regardless of role", () => {
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-1", studentName: "A", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-2", studentName: "B", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-3", studentName: "C", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-4", studentName: "D", danceRole: null });

    const booking = svc.bookings.find((b) => b.studentId === "s-1" && b.status === "confirmed")!;
    const cancel = svc.cancelBooking(booking.id);

    if (cancel.type === "cancelled") {
      expect(cancel.promoted?.studentName).toBe("D");
    }
  });

  it("reindexes waitlist positions after promotion", () => {
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-1", studentName: "L1", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-2", studentName: "L2", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-3", studentName: "F1", danceRole: "follower" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-4", studentName: "F2", danceRole: "follower" });

    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-5", studentName: "L3", danceRole: "leader" });
    svc.bookClass({ bookableClassId: "bc-partner", studentId: "s-6", studentName: "L4", danceRole: "leader" });

    const leaderBooking = svc.bookings.find((b) => b.studentId === "s-1" && b.status === "confirmed")!;
    svc.cancelBooking(leaderBooking.id);

    const remaining = svc.getWaitlistForClass("bc-partner");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].studentName).toBe("L4");
    expect(remaining[0].position).toBe(1);
  });

  it("prevents duplicate booking for the same student", () => {
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-1", studentName: "A", danceRole: null });
    const dupe = svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-1", studentName: "A", danceRole: null });
    expect(dupe.type).toBe("rejected");
    if (dupe.type === "rejected") {
      expect(dupe.reason).toContain("already have");
    }
  });

  it("prevents duplicate waitlist entry for the same student", () => {
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-1", studentName: "A", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-2", studentName: "B", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-3", studentName: "C", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-4", studentName: "D", danceRole: null });

    const dupe = svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-4", studentName: "D", danceRole: null });
    expect(dupe.type).toBe("rejected");
    if (dupe.type === "rejected") {
      expect(dupe.reason).toContain("waitlist");
    }
  });

  it("cancelling a checked-in booking still opens a spot for promotion", () => {
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-1", studentName: "A", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-2", studentName: "B", danceRole: null });
    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-3", studentName: "C", danceRole: null });

    const booking = svc.bookings.find((b) => b.studentId === "s-1")!;
    svc.checkInBooking(booking.id);

    svc.bookClass({ bookableClassId: "bc-solo", studentId: "s-4", studentName: "D", danceRole: null });
    expect(svc.getWaitlistForClass("bc-solo")).toHaveLength(1);

    const cancel = svc.cancelBooking(booking.id);
    if (cancel.type === "cancelled") {
      expect(cancel.promoted?.studentName).toBe("D");
    }
  });
});
