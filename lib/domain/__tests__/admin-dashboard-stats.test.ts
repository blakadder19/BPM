import { describe, expect, it } from "vitest";
import {
  buildPerClassBookingStats,
  computeBookingsByWeekday,
  getClassStats,
  summarizeAttendanceWindow,
  weekdayIndex,
  type DashboardBookingLike,
  type DashboardWaitlistLike,
  type DashboardAttendanceLike,
} from "../admin-dashboard-stats";

const b = (overrides: Partial<DashboardBookingLike> & { bookableClassId: string; status: DashboardBookingLike["status"] }): DashboardBookingLike => ({
  danceRole: null,
  ...overrides,
});

const w = (overrides: Partial<DashboardWaitlistLike> & { bookableClassId: string; status: DashboardWaitlistLike["status"] }): DashboardWaitlistLike => ({
  ...overrides,
});

describe("buildPerClassBookingStats", () => {
  it("counts confirmed + checked_in bookings as active seats", () => {
    const table = buildPerClassBookingStats(
      [
        b({ bookableClassId: "c1", status: "confirmed" }),
        b({ bookableClassId: "c1", status: "checked_in" }),
        b({ bookableClassId: "c1", status: "cancelled" }),
      ],
      [],
    );
    expect(getClassStats(table, "c1").bookedCount).toBe(2);
  });

  it("splits leader / follower correctly and ignores null role", () => {
    const table = buildPerClassBookingStats(
      [
        b({ bookableClassId: "c1", status: "confirmed", danceRole: "leader" }),
        b({ bookableClassId: "c1", status: "confirmed", danceRole: "leader" }),
        b({ bookableClassId: "c1", status: "confirmed", danceRole: "follower" }),
        b({ bookableClassId: "c1", status: "confirmed", danceRole: null }),
      ],
      [],
    );
    const stats = getClassStats(table, "c1");
    expect(stats.bookedCount).toBe(4);
    expect(stats.leaderCount).toBe(2);
    expect(stats.followerCount).toBe(1);
  });

  it("counts only 'waiting' waitlist entries", () => {
    const table = buildPerClassBookingStats(
      [],
      [
        w({ bookableClassId: "c1", status: "waiting" }),
        w({ bookableClassId: "c1", status: "waiting" }),
        w({ bookableClassId: "c1", status: "promoted" }),
        w({ bookableClassId: "c1", status: "expired" }),
      ],
    );
    expect(getClassStats(table, "c1").waitlistCount).toBe(2);
  });

  it("returns zeroed stats for unknown class ids (no crash)", () => {
    const table = buildPerClassBookingStats([], []);
    const stats = getClassStats(table, "missing");
    expect(stats).toEqual({
      bookedCount: 0,
      leaderCount: 0,
      followerCount: 0,
      waitlistCount: 0,
    });
  });

  it("Robin use case — Bronze Salsa + Bronze Bachata sums correctly across two classes", () => {
    const table = buildPerClassBookingStats(
      [
        b({ bookableClassId: "salsa", status: "confirmed", danceRole: "leader" }),
        b({ bookableClassId: "bachata", status: "confirmed", danceRole: "leader" }),
      ],
      [],
    );
    expect(getClassStats(table, "salsa").bookedCount).toBe(1);
    expect(getClassStats(table, "bachata").bookedCount).toBe(1);
    expect(getClassStats(table, "salsa").leaderCount).toBe(1);
    expect(getClassStats(table, "bachata").leaderCount).toBe(1);
  });
});

describe("weekdayIndex", () => {
  it("Monday=0, Sunday=6", () => {
    expect(weekdayIndex("2026-05-25")).toBe(0); // Monday (per cited timestamp)
    expect(weekdayIndex("2026-05-31")).toBe(6); // Sunday
  });

  it("returns -1 for malformed input", () => {
    expect(weekdayIndex("not-a-date")).toBe(-1);
  });
});

describe("computeBookingsByWeekday", () => {
  it("buckets active bookings by class weekday, ignores cancelled / unknown class", () => {
    const lookup = {
      getClassDate: (id: string) =>
        id === "mon" ? "2026-05-25" :
        id === "wed" ? "2026-05-27" :
        id === "sun" ? "2026-05-31" : null,
    };
    const buckets = computeBookingsByWeekday(
      [
        b({ bookableClassId: "mon", status: "confirmed" }),
        b({ bookableClassId: "mon", status: "confirmed" }),
        b({ bookableClassId: "mon", status: "cancelled" }), // excluded
        b({ bookableClassId: "wed", status: "checked_in" }),
        b({ bookableClassId: "sun", status: "confirmed" }),
        b({ bookableClassId: "missing", status: "confirmed" }), // unknown class
      ],
      lookup,
    );
    expect(buckets).toEqual([2, 0, 1, 0, 0, 0, 1]);
  });

  it("returns all zeros when no active bookings exist", () => {
    const buckets = computeBookingsByWeekday(
      [b({ bookableClassId: "c1", status: "cancelled" })],
      { getClassDate: () => "2026-05-25" },
    );
    expect(buckets).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

const a = (date: string, status: DashboardAttendanceLike["status"]): DashboardAttendanceLike => ({ date, status });

describe("summarizeAttendanceWindow", () => {
  it("includes records within the rolling window (today and back N days)", () => {
    // today=2026-05-25, window=30 → from 2026-04-25 inclusive
    const out = summarizeAttendanceWindow(
      [
        a("2026-05-25", "present"),
        a("2026-05-10", "present"),
        a("2026-04-25", "late"), // edge of window
        a("2026-04-24", "absent"), // just outside
      ],
      "2026-05-25",
      30,
    );
    expect(out.totals).toEqual({ present: 2, late: 1, absent: 0, excused: 0 });
    expect(out.total).toBe(3);
  });

  it("ignores records in the future (after today)", () => {
    const out = summarizeAttendanceWindow(
      [a("2026-06-01", "present")],
      "2026-05-25",
      30,
    );
    expect(out.total).toBe(0);
  });

  it("counts each status independently", () => {
    const out = summarizeAttendanceWindow(
      [
        a("2026-05-20", "present"),
        a("2026-05-20", "late"),
        a("2026-05-20", "absent"),
        a("2026-05-20", "excused"),
      ],
      "2026-05-25",
      30,
    );
    expect(out.totals).toEqual({ present: 1, late: 1, absent: 1, excused: 1 });
    expect(out.total).toBe(4);
  });

  it("returns zeros for empty input", () => {
    const out = summarizeAttendanceWindow([], "2026-05-25", 30);
    expect(out.total).toBe(0);
    expect(out.totals).toEqual({ present: 0, late: 0, absent: 0, excused: 0 });
  });
});
