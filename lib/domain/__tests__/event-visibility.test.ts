import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isEventArchived,
  isEventPast,
  shouldShowEventInPublicList,
  shouldShowEventToStudent,
  shouldShowEventOnPublicPage,
  eventHasHistory,
  DELETE_BLOCKED_MESSAGE,
  type EventLikeForVisibility,
} from "../event-visibility";

function evt(
  overrides: Partial<EventLikeForVisibility> = {},
): EventLikeForVisibility {
  return {
    status: "published",
    isVisible: true,
    isPublic: true,
    archivedAt: null,
    endDate: "2099-12-31T23:00:00",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isEventArchived", () => {
  it("is true only when archivedAt is non-null", () => {
    expect(isEventArchived({ archivedAt: null })).toBe(false);
    expect(isEventArchived({ archivedAt: "2026-05-01T10:00:00Z" })).toBe(true);
  });
});

describe("isEventPast", () => {
  it("returns true when end date is in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(isEventPast({ endDate: "2026-05-18T01:00:00" })).toBe(true);
  });

  it("returns false when end date is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    expect(isEventPast({ endDate: "2026-05-18T01:00:00" })).toBe(false);
  });
});

describe("shouldShowEventInPublicList", () => {
  it("shows a normal published + visible + non-archived event", () => {
    expect(shouldShowEventInPublicList(evt())).toBe(true);
  });

  it("hides drafts", () => {
    expect(shouldShowEventInPublicList(evt({ status: "draft" }))).toBe(false);
  });

  it("hides non-visible published events", () => {
    expect(shouldShowEventInPublicList(evt({ isVisible: false }))).toBe(false);
  });

  it("hides archived events even when published + visible", () => {
    expect(
      shouldShowEventInPublicList(evt({ archivedAt: "2026-06-01T00:00:00Z" })),
    ).toBe(false);
  });

  it("does NOT filter on isPublic (that's only for the unauth route)", () => {
    expect(shouldShowEventInPublicList(evt({ isPublic: false }))).toBe(true);
  });
});

describe("shouldShowEventToStudent", () => {
  it("aliases shouldShowEventInPublicList — archived events 404 to students", () => {
    expect(
      shouldShowEventToStudent(evt({ archivedAt: "2026-06-01T00:00:00Z" })),
    ).toBe(false);
    expect(shouldShowEventToStudent(evt())).toBe(true);
  });
});

describe("shouldShowEventOnPublicPage", () => {
  it("requires status + isPublic + non-archived", () => {
    expect(shouldShowEventOnPublicPage(evt())).toBe(true);
  });

  it("hides drafts", () => {
    expect(shouldShowEventOnPublicPage(evt({ status: "draft" }))).toBe(false);
  });

  it("requires isPublic (stricter than student list)", () => {
    expect(shouldShowEventOnPublicPage(evt({ isPublic: false }))).toBe(false);
  });

  it("hides archived events even when published + public", () => {
    expect(
      shouldShowEventOnPublicPage(evt({ archivedAt: "2026-06-01T00:00:00Z" })),
    ).toBe(false);
  });

  it("does NOT require isVisible (public shareable URL uses its own flag)", () => {
    expect(shouldShowEventOnPublicPage(evt({ isVisible: false }))).toBe(true);
  });
});

describe("eventHasHistory", () => {
  it("is false for null / undefined / empty", () => {
    expect(eventHasHistory(null)).toBe(false);
    expect(eventHasHistory(undefined)).toBe(false);
    expect(eventHasHistory([])).toBe(false);
  });

  it("is true when at least one purchase exists", () => {
    expect(eventHasHistory([{ id: "pur-1" }])).toBe(true);
    expect(eventHasHistory([{ id: "pur-1" }, { id: "pur-2" }])).toBe(true);
  });
});

describe("DELETE_BLOCKED_MESSAGE", () => {
  it("includes the archive-instead instruction", () => {
    expect(DELETE_BLOCKED_MESSAGE.toLowerCase()).toContain("archive");
    expect(DELETE_BLOCKED_MESSAGE.toLowerCase()).toContain("history");
  });
});
