import { describe, it, expect } from "vitest";
import { getNextConsecutiveTerm, type TermLike } from "../term-rules";

const TERMS: TermLike[] = [
  { id: "t-1", name: "Term 1", startDate: "2026-03-30", endDate: "2026-04-26", status: "active" },
  { id: "t-2", name: "Term 2", startDate: "2026-04-27", endDate: "2026-05-24", status: "upcoming" },
  { id: "t-3", name: "Term 3", startDate: "2026-05-25", endDate: "2026-06-21", status: "upcoming" },
];

describe("getNextConsecutiveTerm", () => {
  it("returns the next term after the given start term", () => {
    const next = getNextConsecutiveTerm(TERMS, "t-1");
    expect(next?.id).toBe("t-2");
  });

  it("returns Term 3 when starting from Term 2", () => {
    const next = getNextConsecutiveTerm(TERMS, "t-2");
    expect(next?.id).toBe("t-3");
  });

  it("returns null when the start term is the last term", () => {
    expect(getNextConsecutiveTerm(TERMS, "t-3")).toBeNull();
  });

  it("returns null for an unknown term ID", () => {
    expect(getNextConsecutiveTerm(TERMS, "t-unknown")).toBeNull();
  });

  it("handles unsorted input correctly", () => {
    const shuffled = [TERMS[2], TERMS[0], TERMS[1]];
    const next = getNextConsecutiveTerm(shuffled, "t-1");
    expect(next?.id).toBe("t-2");
  });
});
