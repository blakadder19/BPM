import { describe, it, expect } from "vitest";
import { findPromotionCandidate, reindexPositions, type WaitingEntry } from "../waitlist-rules";
import type { BookableClassCapacity } from "../booking-rules";

function makeCapacity(overrides: Partial<BookableClassCapacity> = {}): BookableClassCapacity {
  return {
    classType: "class",
    status: "open",
    danceStyleRequiresBalance: true,
    maxCapacity: 20,
    leaderCap: 10,
    followerCap: 10,
    currentLeaders: 9,
    currentFollowers: 9,
    totalBooked: 18,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<WaitingEntry> & { id: string }): WaitingEntry {
  return {
    studentId: `student-${overrides.id}`,
    danceRole: "leader",
    position: 1,
    status: "waiting",
    ...overrides,
  };
}

describe("findPromotionCandidate", () => {
  it("returns null when no waiting entries", () => {
    const result = findPromotionCandidate([], "leader", makeCapacity());
    expect(result).toBeNull();
  });

  it("promotes the first waiting entry with matching role", () => {
    const entries: WaitingEntry[] = [
      makeEntry({ id: "wl-1", danceRole: "follower", position: 1 }),
      makeEntry({ id: "wl-2", danceRole: "leader", position: 2 }),
    ];
    const result = findPromotionCandidate(entries, "leader", makeCapacity());
    expect(result).not.toBeNull();
    expect(result!.promoted.id).toBe("wl-2");
  });

  it("skips non-matching role entries for partner class", () => {
    const entries: WaitingEntry[] = [
      makeEntry({ id: "wl-1", danceRole: "follower", position: 1 }),
      makeEntry({ id: "wl-2", danceRole: "follower", position: 2 }),
    ];
    // Freed a leader spot, but all waitlisted are followers
    const result = findPromotionCandidate(entries, "leader", makeCapacity());
    expect(result).toBeNull();
  });

  it("promotes any entry for non-partner class (ignores role)", () => {
    const entries: WaitingEntry[] = [
      makeEntry({ id: "wl-1", danceRole: "follower", position: 1 }),
    ];
    const capacity = makeCapacity({
      danceStyleRequiresBalance: false,
      leaderCap: null,
      followerCap: null,
    });
    const result = findPromotionCandidate(entries, null, capacity);
    expect(result).not.toBeNull();
    expect(result!.promoted.id).toBe("wl-1");
  });

  it("respects FIFO ordering by position", () => {
    const entries: WaitingEntry[] = [
      makeEntry({ id: "wl-3", danceRole: "leader", position: 3 }),
      makeEntry({ id: "wl-1", danceRole: "leader", position: 1 }),
      makeEntry({ id: "wl-2", danceRole: "leader", position: 2 }),
    ];
    const result = findPromotionCandidate(entries, "leader", makeCapacity());
    expect(result!.promoted.id).toBe("wl-1");
  });

  it("skips entries not in waiting status", () => {
    const entries: WaitingEntry[] = [
      makeEntry({ id: "wl-1", danceRole: "leader", position: 1, status: "promoted" }),
      makeEntry({ id: "wl-2", danceRole: "leader", position: 2, status: "expired" }),
      makeEntry({ id: "wl-3", danceRole: "leader", position: 3, status: "waiting" }),
    ];
    const result = findPromotionCandidate(entries, "leader", makeCapacity());
    expect(result!.promoted.id).toBe("wl-3");
  });

  it("returns null when promotion would still exceed capacity", () => {
    const entries: WaitingEntry[] = [
      makeEntry({ id: "wl-1", danceRole: "leader", position: 1 }),
    ];
    // Leaders at cap, no room to promote a leader
    const capacity = makeCapacity({ currentLeaders: 10, totalBooked: 19 });
    const result = findPromotionCandidate(entries, "leader", capacity);
    expect(result).toBeNull();
  });

  it("includes reason with position info", () => {
    const entries: WaitingEntry[] = [
      makeEntry({ id: "wl-1", danceRole: "leader", position: 3 }),
    ];
    const result = findPromotionCandidate(entries, "leader", makeCapacity());
    expect(result!.reason).toContain("#3");
  });
});

describe("reindexPositions", () => {
  it("reindexes remaining waiting entries sequentially", () => {
    const entries = [
      makeEntry({ id: "a", position: 1, status: "waiting" }),
      makeEntry({ id: "b", position: 3, status: "waiting" }),
      makeEntry({ id: "c", position: 5, status: "waiting" }),
    ];
    const reindexed = reindexPositions(entries);
    expect(reindexed.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it("filters out non-waiting entries", () => {
    const entries = [
      makeEntry({ id: "a", position: 1, status: "promoted" }),
      makeEntry({ id: "b", position: 2, status: "waiting" }),
      makeEntry({ id: "c", position: 3, status: "expired" }),
    ];
    const reindexed = reindexPositions(entries);
    expect(reindexed).toHaveLength(1);
    expect(reindexed[0].position).toBe(1);
    expect(reindexed[0].id).toBe("b");
  });

  it("returns empty array when no waiting entries", () => {
    expect(reindexPositions([])).toEqual([]);
  });
});
