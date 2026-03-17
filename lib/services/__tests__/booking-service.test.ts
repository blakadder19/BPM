import { describe, it, expect, beforeEach } from "vitest";
import { BookingService, type ClassSnapshot, type StoredBooking, type StoredWaitlistEntry } from "../booking-service";

function makeClass(overrides: Partial<ClassSnapshot> & { id: string }): ClassSnapshot {
  return {
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

function makeNonPartnerClass(overrides: Partial<ClassSnapshot> & { id: string }): ClassSnapshot {
  return makeClass({
    title: "Reggaeton Open",
    styleName: "Reggaeton",
    danceStyleRequiresBalance: false,
    leaderCap: null,
    followerCap: null,
    maxCapacity: 3,
    ...overrides,
  });
}

describe("BookingService", () => {
  let service: BookingService;
  const classId = "cls-1";

  beforeEach(() => {
    service = new BookingService([], [], [makeClass({ id: classId })]);
  });

  describe("bookClass — confirms", () => {
    it("confirms when class has capacity", () => {
      const result = service.bookClass({
        bookableClassId: classId,
        studentId: "s-1",
        studentName: "Alice",
        danceRole: "leader",
      });
      expect(result.type).toBe("confirmed");
    });

    it("creates a booking record on confirmation", () => {
      service.bookClass({
        bookableClassId: classId,
        studentId: "s-1",
        studentName: "Alice",
        danceRole: "leader",
      });
      const bookings = service.getConfirmedBookingsForClass(classId);
      expect(bookings).toHaveLength(1);
      expect(bookings[0].danceRole).toBe("leader");
    });
  });

  describe("bookClass — waitlists", () => {
    it("waitlists when leader cap is full", () => {
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-2", studentName: "B", danceRole: "leader" });
      // 2 leaders at cap
      const result = service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "leader" });
      expect(result.type).toBe("waitlisted");
      if (result.type === "waitlisted") {
        expect(result.position).toBe(1);
      }
    });

    it("waitlists when total capacity is full", () => {
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-2", studentName: "B", danceRole: "follower" });
      service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-4", studentName: "D", danceRole: "follower" });
      // 4/4 full
      const result = service.bookClass({ bookableClassId: classId, studentId: "s-5", studentName: "E", danceRole: "follower" });
      expect(result.type).toBe("waitlisted");
    });

    it("assigns sequential waitlist positions", () => {
      // Fill up
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-2", studentName: "B", danceRole: "leader" });

      const r1 = service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "leader" });
      const r2 = service.bookClass({ bookableClassId: classId, studentId: "s-4", studentName: "D", danceRole: "leader" });

      expect(r1.type).toBe("waitlisted");
      expect(r2.type).toBe("waitlisted");
      if (r1.type === "waitlisted" && r2.type === "waitlisted") {
        expect(r1.position).toBe(1);
        expect(r2.position).toBe(2);
      }
    });
  });

  describe("bookClass — rejections", () => {
    it("rejects when class not found", () => {
      const result = service.bookClass({
        bookableClassId: "nonexistent",
        studentId: "s-1",
        studentName: "Alice",
        danceRole: "leader",
      });
      expect(result.type).toBe("rejected");
    });

    it("rejects duplicate booking for same student", () => {
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      const result = service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      expect(result.type).toBe("rejected");
      if (result.type === "rejected") {
        expect(result.reason).toContain("already have");
      }
    });

    it("rejects duplicate waitlist for same student", () => {
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-2", studentName: "B", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "leader" });
      // s-3 is on waitlist; try again
      const result = service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "leader" });
      expect(result.type).toBe("rejected");
      if (result.type === "rejected") {
        expect(result.reason).toContain("already on the waitlist");
      }
    });
  });

  describe("cancelBooking — promotion", () => {
    it("promotes first compatible waitlist entry when a spot opens", () => {
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-2", studentName: "B", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "follower" });
      service.bookClass({ bookableClassId: classId, studentId: "s-4", studentName: "D", danceRole: "follower" });

      // Waitlist a leader
      service.bookClass({ bookableClassId: classId, studentId: "s-5", studentName: "E", danceRole: "leader" });
      expect(service.getWaitlistForClass(classId)).toHaveLength(1);

      // Cancel a leader booking
      const leaderBooking = service.bookings.find(
        (b) => b.studentId === "s-1" && b.status === "confirmed"
      )!;
      const result = service.cancelBooking(leaderBooking.id);

      expect(result.type).toBe("cancelled");
      if (result.type === "cancelled") {
        expect(result.promoted).not.toBeNull();
        expect(result.promoted!.studentName).toBe("E");
      }

      // Waitlist should be empty now
      expect(service.getWaitlistForClass(classId)).toHaveLength(0);
      // E should have a confirmed booking
      const eBookings = service.getConfirmedBookingsForClass(classId).filter(
        (b) => b.studentId === "s-5"
      );
      expect(eBookings).toHaveLength(1);
    });

    it("does not promote wrong role for partner class", () => {
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-2", studentName: "B", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "follower" });
      service.bookClass({ bookableClassId: classId, studentId: "s-4", studentName: "D", danceRole: "follower" });

      // Waitlist a follower
      service.bookClass({ bookableClassId: classId, studentId: "s-5", studentName: "E", danceRole: "follower" });

      // Cancel a leader — should NOT promote follower
      const leaderBooking = service.bookings.find(
        (b) => b.studentId === "s-1" && b.status === "confirmed"
      )!;
      const result = service.cancelBooking(leaderBooking.id);

      expect(result.type).toBe("cancelled");
      if (result.type === "cancelled") {
        expect(result.promoted).toBeNull();
      }
      // Follower is still on waitlist
      expect(service.getWaitlistForClass(classId)).toHaveLength(1);
    });

    it("reindexes waitlist after promotion", () => {
      service.bookClass({ bookableClassId: classId, studentId: "s-1", studentName: "A", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-2", studentName: "B", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-3", studentName: "C", danceRole: "follower" });
      service.bookClass({ bookableClassId: classId, studentId: "s-4", studentName: "D", danceRole: "follower" });

      // Two leaders on waitlist
      service.bookClass({ bookableClassId: classId, studentId: "s-5", studentName: "E", danceRole: "leader" });
      service.bookClass({ bookableClassId: classId, studentId: "s-6", studentName: "F", danceRole: "leader" });

      // Cancel a leader — promotes E (position 1)
      const leaderBooking = service.bookings.find(
        (b) => b.studentId === "s-1" && b.status === "confirmed"
      )!;
      service.cancelBooking(leaderBooking.id);

      // F should now be position 1
      const remaining = service.getWaitlistForClass(classId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].studentName).toBe("F");
      expect(remaining[0].position).toBe(1);
    });
  });

  describe("non-partner class", () => {
    let nonPartnerService: BookingService;
    const npClassId = "np-1";

    beforeEach(() => {
      nonPartnerService = new BookingService([], [], [makeNonPartnerClass({ id: npClassId })]);
    });

    it("confirms without role", () => {
      const result = nonPartnerService.bookClass({
        bookableClassId: npClassId,
        studentId: "s-1",
        studentName: "A",
        danceRole: null,
      });
      expect(result.type).toBe("confirmed");
    });

    it("waitlists when capacity is full", () => {
      nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-1", studentName: "A", danceRole: null });
      nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-2", studentName: "B", danceRole: null });
      nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-3", studentName: "C", danceRole: null });
      // 3/3 full
      const result = nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-4", studentName: "D", danceRole: null });
      expect(result.type).toBe("waitlisted");
    });

    it("promotes waitlisted entry regardless of role when spot opens", () => {
      nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-1", studentName: "A", danceRole: null });
      nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-2", studentName: "B", danceRole: null });
      nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-3", studentName: "C", danceRole: null });
      nonPartnerService.bookClass({ bookableClassId: npClassId, studentId: "s-4", studentName: "D", danceRole: null });

      const booking = nonPartnerService.bookings.find(
        (b) => b.studentId === "s-1" && b.status === "confirmed"
      )!;
      const result = nonPartnerService.cancelBooking(booking.id);

      expect(result.type).toBe("cancelled");
      if (result.type === "cancelled") {
        expect(result.promoted).not.toBeNull();
        expect(result.promoted!.studentName).toBe("D");
      }
    });
  });
});
