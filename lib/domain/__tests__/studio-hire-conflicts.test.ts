import { describe, it, expect } from "vitest";
import {
  isOvernightBooking,
  timeSlotsOverlap,
  findStudioHireConflicts,
} from "../studio-hire-conflicts";

describe("isOvernightBooking", () => {
  it("returns false for same-day booking", () => {
    expect(isOvernightBooking("10:00", "14:00")).toBe(false);
  });

  it("returns true when endTime < startTime", () => {
    expect(isOvernightBooking("23:00", "01:00")).toBe(true);
  });

  it("returns true when endTime === startTime (edge case)", () => {
    expect(isOvernightBooking("10:00", "10:00")).toBe(true);
  });
});

describe("timeSlotsOverlap — same-day", () => {
  it("detects overlap on same date", () => {
    expect(
      timeSlotsOverlap(
        { date: "2025-03-01", startTime: "10:00", endTime: "12:00" },
        { date: "2025-03-01", startTime: "11:00", endTime: "13:00" }
      )
    ).toBe(true);
  });

  it("no overlap when touching boundaries", () => {
    expect(
      timeSlotsOverlap(
        { date: "2025-03-01", startTime: "10:00", endTime: "11:00" },
        { date: "2025-03-01", startTime: "11:00", endTime: "12:00" }
      )
    ).toBe(false);
  });

  it("no overlap on different dates", () => {
    expect(
      timeSlotsOverlap(
        { date: "2025-03-01", startTime: "10:00", endTime: "12:00" },
        { date: "2025-03-02", startTime: "10:00", endTime: "12:00" }
      )
    ).toBe(false);
  });
});

describe("timeSlotsOverlap — overnight", () => {
  it("overnight booking on day 1 overlaps with late-night same-day booking", () => {
    expect(
      timeSlotsOverlap(
        { date: "2025-03-01", startTime: "23:00", endTime: "02:00" },
        { date: "2025-03-01", startTime: "22:00", endTime: "23:30" }
      )
    ).toBe(true);
  });

  it("overnight booking overlaps with early-morning booking on next day", () => {
    expect(
      timeSlotsOverlap(
        { date: "2025-03-01", startTime: "23:00", endTime: "02:00" },
        { date: "2025-03-02", startTime: "01:00", endTime: "03:00" }
      )
    ).toBe(true);
  });

  it("overnight booking does NOT overlap with afternoon booking on next day", () => {
    expect(
      timeSlotsOverlap(
        { date: "2025-03-01", startTime: "23:00", endTime: "02:00" },
        { date: "2025-03-02", startTime: "10:00", endTime: "12:00" }
      )
    ).toBe(false);
  });

  it("two overnight bookings on consecutive days do not overlap if ranges don't touch", () => {
    expect(
      timeSlotsOverlap(
        { date: "2025-03-01", startTime: "23:00", endTime: "01:00" },
        { date: "2025-03-02", startTime: "23:00", endTime: "01:00" }
      )
    ).toBe(false);
  });
});

describe("findStudioHireConflicts — overnight", () => {
  const entries = [
    {
      id: "e1",
      requesterName: "Alice",
      date: "2025-03-01",
      startTime: "23:00",
      endTime: "02:00",
      status: "confirmed",
    },
    {
      id: "e2",
      requesterName: "Bob",
      date: "2025-03-02",
      startTime: "10:00",
      endTime: "12:00",
      status: "confirmed",
    },
  ];

  it("detects conflict with overnight booking on same start date", () => {
    const { hasConflict } = findStudioHireConflicts(
      { date: "2025-03-01", startTime: "22:00", endTime: "23:30" },
      entries
    );
    expect(hasConflict).toBe(true);
  });

  it("detects conflict with next-day tail of overnight booking", () => {
    const { hasConflict } = findStudioHireConflicts(
      { date: "2025-03-02", startTime: "01:00", endTime: "03:00" },
      entries
    );
    expect(hasConflict).toBe(true);
  });

  it("no conflict for daytime booking on day after overnight", () => {
    const { hasConflict } = findStudioHireConflicts(
      { date: "2025-03-02", startTime: "14:00", endTime: "16:00" },
      entries
    );
    expect(hasConflict).toBe(false);
  });

  it("excludes self from conflicts", () => {
    const { hasConflict } = findStudioHireConflicts(
      { date: "2025-03-01", startTime: "23:00", endTime: "02:00" },
      entries,
      "e1"
    );
    expect(hasConflict).toBe(false);
  });

  it("skips cancelled entries", () => {
    const withCancelled = [
      { ...entries[0], status: "cancelled" },
      entries[1],
    ];
    const { hasConflict } = findStudioHireConflicts(
      { date: "2025-03-01", startTime: "22:00", endTime: "23:30" },
      withCancelled
    );
    expect(hasConflict).toBe(false);
  });
});
