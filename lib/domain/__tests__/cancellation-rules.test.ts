import { describe, it, expect } from "vitest";
import {
  classStartDateTime,
  isLateCancellation,
  penaltiesApplyTo,
  penaltyFeeCents,
} from "../cancellation-rules";

describe("classStartDateTime", () => {
  it("builds a Date from date and time strings", () => {
    const d = classStartDateTime("2026-03-23", "19:00");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March = 2
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(19);
    expect(d.getMinutes()).toBe(0);
  });
});

describe("isLateCancellation", () => {
  const classStart = new Date("2026-03-23T19:00:00");

  it("returns false for cancellation 2 hours before class (on-time)", () => {
    const cancelledAt = new Date("2026-03-23T17:00:00");
    expect(isLateCancellation(classStart, cancelledAt)).toBe(false);
  });

  it("returns false for cancellation exactly at cutoff boundary", () => {
    const cancelledAt = new Date("2026-03-23T18:00:00");
    expect(isLateCancellation(classStart, cancelledAt)).toBe(false);
  });

  it("returns true for cancellation 30 minutes before class (late)", () => {
    const cancelledAt = new Date("2026-03-23T18:30:00");
    expect(isLateCancellation(classStart, cancelledAt)).toBe(true);
  });

  it("returns true for cancellation 1 minute before class", () => {
    const cancelledAt = new Date("2026-03-23T18:59:00");
    expect(isLateCancellation(classStart, cancelledAt)).toBe(true);
  });

  it("returns true for cancellation after class already started", () => {
    const cancelledAt = new Date("2026-03-23T19:15:00");
    expect(isLateCancellation(classStart, cancelledAt)).toBe(true);
  });

  it("returns false for cancellation a full day before class", () => {
    const cancelledAt = new Date("2026-03-22T19:00:00");
    expect(isLateCancellation(classStart, cancelledAt)).toBe(false);
  });

  it("respects a custom cutoff (120 minutes)", () => {
    const cancelledAt = new Date("2026-03-23T17:30:00"); // 90 min before
    expect(isLateCancellation(classStart, cancelledAt, 120)).toBe(true);
    expect(isLateCancellation(classStart, cancelledAt, 60)).toBe(false);
  });

  it("with cutoff = 0, only cancellations after class start are late", () => {
    const justBefore = new Date("2026-03-23T18:59:59");
    expect(isLateCancellation(classStart, justBefore, 0)).toBe(false);
    const afterStart = new Date("2026-03-23T19:01:00");
    expect(isLateCancellation(classStart, afterStart, 0)).toBe(true);
  });
});

describe("penaltiesApplyTo", () => {
  it("returns true for class type", () => {
    expect(penaltiesApplyTo("class")).toBe(true);
  });

  it("returns false for social type", () => {
    expect(penaltiesApplyTo("social")).toBe(false);
  });

  it("returns false for student_practice type", () => {
    expect(penaltiesApplyTo("student_practice")).toBe(false);
  });
});

describe("penaltyFeeCents", () => {
  it("returns 200 for late_cancel", () => {
    expect(penaltyFeeCents("late_cancel")).toBe(200);
  });

  it("returns 500 for no_show", () => {
    expect(penaltyFeeCents("no_show")).toBe(500);
  });
});
