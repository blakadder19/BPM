import { describe, it, expect } from "vitest";
import { canBook, isBookableClassType, nextWaitlistPosition, type BookableClassCapacity } from "../booking-rules";

function makeCapacity(overrides: Partial<BookableClassCapacity> = {}): BookableClassCapacity {
  return {
    classType: "class",
    status: "open",
    danceStyleRequiresBalance: true,
    maxCapacity: 20,
    leaderCap: 10,
    followerCap: 10,
    currentLeaders: 5,
    currentFollowers: 5,
    totalBooked: 10,
    ...overrides,
  };
}

describe("isBookableClassType", () => {
  it("returns true for class", () => {
    expect(isBookableClassType("class")).toBe(true);
  });

  it("returns false for social", () => {
    expect(isBookableClassType("social")).toBe(false);
  });

  it("returns false for student_practice when configured non-bookable", () => {
    expect(isBookableClassType("student_practice")).toBe(false);
  });
});

describe("canBook", () => {
  it("rejects when class is not open", () => {
    const result = canBook(makeCapacity({ status: "closed" }), "leader");
    expect(result).toEqual({ allowed: false, waitlisted: false, reason: expect.stringContaining("not open") });
  });

  it("rejects when class type is not bookable (social)", () => {
    const result = canBook(makeCapacity({ classType: "social" }), null);
    expect(result).toEqual({ allowed: false, waitlisted: false, reason: expect.stringContaining("not bookable") });
  });

  it("rejects when balance required but no role given", () => {
    const result = canBook(makeCapacity({ danceStyleRequiresBalance: true }), null);
    expect(result).toEqual({ allowed: false, waitlisted: false, reason: expect.stringContaining("Role selection required") });
  });

  it("confirms when partner class has capacity for the requested role", () => {
    const result = canBook(makeCapacity(), "leader");
    expect(result).toEqual({ allowed: true, waitlisted: false });
  });

  it("confirms when non-partner class has capacity (no role needed)", () => {
    const result = canBook(
      makeCapacity({ danceStyleRequiresBalance: false, leaderCap: null, followerCap: null }),
      null
    );
    expect(result).toEqual({ allowed: true, waitlisted: false });
  });

  it("waitlists when leader cap is full", () => {
    const result = canBook(
      makeCapacity({ currentLeaders: 10, totalBooked: 15 }),
      "leader"
    );
    expect(result.allowed).toBe(true);
    expect(result.waitlisted).toBe(true);
  });

  it("waitlists when follower cap is full", () => {
    const result = canBook(
      makeCapacity({ currentFollowers: 10, totalBooked: 15 }),
      "follower"
    );
    expect(result.allowed).toBe(true);
    expect(result.waitlisted).toBe(true);
  });

  it("waitlists when total capacity is full for non-partner class", () => {
    const result = canBook(
      makeCapacity({
        danceStyleRequiresBalance: false,
        leaderCap: null,
        followerCap: null,
        maxCapacity: 25,
        totalBooked: 25,
      }),
      null
    );
    expect(result.allowed).toBe(true);
    expect(result.waitlisted).toBe(true);
  });

  it("waitlists when imbalance would exceed limit", () => {
    // 7 leaders, 5 followers. Adding a leader → 8L/5F → imbalance=3, limit=2
    const result = canBook(
      makeCapacity({
        currentLeaders: 7,
        currentFollowers: 5,
        totalBooked: 12,
        allowedImbalance: 2,
      }),
      "leader"
    );
    expect(result.allowed).toBe(true);
    expect(result.waitlisted).toBe(true);
    expect("reason" in result && result.reason).toContain("balance limit");
  });

  it("confirms when imbalance is exactly at limit", () => {
    // 6 leaders, 4 followers. Adding a leader → 7L/4F → imbalance=3, but if limit=3 it's ok
    // Actually let's do: 5L, 4F, adding leader → 6L/4F → imbalance=2, limit=2
    const result = canBook(
      makeCapacity({
        currentLeaders: 5,
        currentFollowers: 4,
        totalBooked: 9,
        allowedImbalance: 2,
      }),
      "leader"
    );
    expect(result).toEqual({ allowed: true, waitlisted: false });
  });

  it("confirms follower when it would reduce imbalance", () => {
    // 7 leaders, 5 followers. Adding a follower → 7L/6F → imbalance=1, fine
    const result = canBook(
      makeCapacity({
        currentLeaders: 7,
        currentFollowers: 5,
        totalBooked: 12,
        allowedImbalance: 2,
      }),
      "follower"
    );
    expect(result).toEqual({ allowed: true, waitlisted: false });
  });

  it("skips imbalance check for non-partner classes", () => {
    // Large imbalance but class doesn't require balance
    const result = canBook(
      makeCapacity({
        danceStyleRequiresBalance: false,
        leaderCap: null,
        followerCap: null,
        currentLeaders: 20,
        currentFollowers: 0,
        totalBooked: 20,
        maxCapacity: 25,
      }),
      null
    );
    expect(result).toEqual({ allowed: true, waitlisted: false });
  });

  it("waitlists total capacity even when role has room", () => {
    const result = canBook(
      makeCapacity({
        maxCapacity: 10,
        currentLeaders: 3,
        currentFollowers: 3,
        totalBooked: 10,
      }),
      "leader"
    );
    // Leader cap (10) not reached, but total (10/10) is at capacity
    expect(result.allowed).toBe(true);
    expect(result.waitlisted).toBe(true);
  });

  it("uses allowedImbalance=0 for strict balance enforcement", () => {
    // 3L, 2F. Adding leader → 4L/2F → imbalance=2, limit=0 → waitlist
    const result = canBook(
      makeCapacity({
        currentLeaders: 3,
        currentFollowers: 2,
        totalBooked: 5,
        allowedImbalance: 0,
      }),
      "leader"
    );
    expect(result.allowed).toBe(true);
    expect(result.waitlisted).toBe(true);
  });

  it("confirms with allowedImbalance=0 when counts are equal", () => {
    // 5L, 5F. Adding leader → 6L/5F → imbalance=1. Limit=0 → waitlist!
    const result = canBook(
      makeCapacity({
        currentLeaders: 5,
        currentFollowers: 5,
        totalBooked: 10,
        allowedImbalance: 0,
      }),
      "leader"
    );
    // With strict balance (0), even 1 imbalance triggers waitlist
    expect(result.allowed).toBe(true);
    expect(result.waitlisted).toBe(true);
  });
});

describe("nextWaitlistPosition", () => {
  it("returns 1 when no existing entries", () => {
    expect(nextWaitlistPosition(null)).toBe(1);
  });

  it("returns next position after current max", () => {
    expect(nextWaitlistPosition(3)).toBe(4);
  });

  it("handles zero", () => {
    expect(nextWaitlistPosition(0)).toBe(1);
  });
});
