import { describe, it, expect } from "vitest";
import {
  canBookBeginnerIntakeClass,
  BEGINNER_ADVANCE_MESSAGES,
} from "../beginner-advance-booking";
import type { TermLike } from "../term-rules";

const NEXT_TERM_PUBLISHED: TermLike = {
  id: "t-next",
  name: "Next Term",
  startDate: "2026-04-27",
  endDate: "2026-05-24",
  status: "upcoming",
};

const NEXT_TERM_DRAFT: TermLike = { ...NEXT_TERM_PUBLISHED, status: "draft" };

const CURRENT_TERM: TermLike = {
  id: "t-curr",
  name: "Current Term",
  startDate: "2026-03-30",
  endDate: "2026-04-26",
  status: "active",
};

const TODAY = "2026-04-10";

describe("canBookBeginnerIntakeClass", () => {
  it("allows non-beginner classes regardless of term week", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Intermediate", date: "2026-05-20", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
    });
    expect(res.allowed).toBe(true);
  });

  it("allows non-term-bound beginner classes", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-05-20", termBound: false },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
    });
    expect(res.allowed).toBe(true);
  });

  it("allows Beginner 1 in week 1 of a published next term", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-04-30", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
    });
    expect(res.allowed).toBe(true);
  });

  it("allows Beginner 1 in week 2 of a published next term", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-05-07", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
    });
    expect(res.allowed).toBe(true);
  });

  it("blocks Beginner 1 in week 3 of a published next term", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-05-13", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
    });
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.reason).toBe("term_weeks_3_4");
      expect(res.message).toBe(BEGINNER_ADVANCE_MESSAGES.weekTooLate);
    }
  });

  it("blocks Beginner 1 in week 4 of a published next term", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-05-22", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
    });
    expect(res.allowed).toBe(false);
  });

  it("blocks Beginner 1 in any week of a draft next term", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-04-30", termBound: true },
      term: NEXT_TERM_DRAFT,
      today: TODAY,
    });
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.reason).toBe("term_not_published");
      expect(res.message).toBe(BEGINNER_ADVANCE_MESSAGES.termNotPublished);
    }
  });

  it("blocks when allowAdvanceBooking is false", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-04-30", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
      allowAdvanceBooking: false,
    });
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.reason).toBe("term_not_published");
  });

  it("defers current/past term decisions to the engine (returns allowed)", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-04-20", termBound: true },
      term: CURRENT_TERM,
      today: TODAY,
    });
    expect(res.allowed).toBe(true);
  });

  it("honours custom beginnerLevelNames", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Foundation", date: "2026-05-20", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
      beginnerLevelNames: ["Foundation"],
    });
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.reason).toBe("term_weeks_3_4");
  });

  it("honours a custom maxIntakeWeek", () => {
    const res = canBookBeginnerIntakeClass({
      classInstance: { level: "Beginner 1", date: "2026-05-13", termBound: true },
      term: NEXT_TERM_PUBLISHED,
      today: TODAY,
      maxIntakeWeek: 3,
    });
    expect(res.allowed).toBe(true);
  });
});
