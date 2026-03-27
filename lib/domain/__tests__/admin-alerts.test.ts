import { describe, it, expect } from "vitest";
import { computeAdminAlerts } from "../admin-alerts";
import type { MockTerm, MockBookableClass, MockTeacherPair } from "@/lib/mock-data";

function makeTerm(overrides: Partial<MockTerm> = {}): MockTerm {
  return {
    id: "t1",
    name: "Term 1",
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    status: "active",
    notes: null,
    ...overrides,
  };
}

function makeInstance(overrides: Partial<MockBookableClass> = {}): MockBookableClass {
  return {
    id: "bc1",
    classId: "c1",
    title: "Test Class",
    classType: "class",
    styleName: "Bachata",
    styleId: "ds-1",
    level: "Improvers",
    date: "2026-04-10",
    startTime: "18:30",
    endTime: "19:30",
    status: "scheduled",
    maxCapacity: 16,
    leaderCap: 8,
    followerCap: 8,
    bookedCount: 0,
    leaderCount: 0,
    followerCount: 0,
    waitlistCount: 0,
    location: "Studio A",
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<MockTeacherPair> = {}): MockTeacherPair {
  return {
    id: "a1",
    classId: "c1",
    classTitle: "Test Class",
    teacher1Id: "t1",
    teacher2Id: null,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    isActive: true,
    ...overrides,
  };
}

describe("computeAdminAlerts", () => {
  it("returns no-active-term (critical) when no terms at all", () => {
    const alerts = computeAdminAlerts({
      terms: [],
      instances: [],
      teacherAssignments: [],
      today: "2026-04-10",
    });
    const a = alerts.find((x) => x.id === "no-active-term");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("critical");
  });

  it("returns no-active-term (warning) when gap between terms but next exists", () => {
    const alerts = computeAdminAlerts({
      terms: [makeTerm({ startDate: "2026-05-01", endDate: "2026-05-28", status: "upcoming" })],
      instances: [],
      teacherAssignments: [],
      today: "2026-04-10",
    });
    const a = alerts.find((x) => x.id === "no-active-term");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("warning");
    expect(a!.message).toContain("21 days");
  });

  it("returns term-ending-soon when active term ends within 7 days", () => {
    const alerts = computeAdminAlerts({
      terms: [makeTerm({ endDate: "2026-04-13" })],
      instances: [],
      teacherAssignments: [],
      today: "2026-04-10",
    });
    const a = alerts.find((x) => x.id === "term-ending-soon");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("warning");
    expect(a!.message).toContain("3 days");
  });

  it("does not return term-ending-soon when more than 7 days left", () => {
    const alerts = computeAdminAlerts({
      terms: [makeTerm({ endDate: "2026-04-28" })],
      instances: [],
      teacherAssignments: [],
      today: "2026-04-10",
    });
    expect(alerts.find((x) => x.id === "term-ending-soon")).toBeUndefined();
  });

  it("returns no-upcoming-terms when active term is last", () => {
    const alerts = computeAdminAlerts({
      terms: [makeTerm()],
      instances: [],
      teacherAssignments: [],
      today: "2026-04-10",
    });
    const a = alerts.find((x) => x.id === "no-upcoming-terms");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("info");
  });

  it("returns classes-without-teacher for unassigned upcoming classes", () => {
    const alerts = computeAdminAlerts({
      terms: [makeTerm()],
      instances: [
        makeInstance({ id: "bc1", classId: "c1", date: "2026-04-12" }),
        makeInstance({ id: "bc2", classId: "c2", date: "2026-04-12" }),
      ],
      teacherAssignments: [makeAssignment({ classId: "c1" })],
      today: "2026-04-10",
    });
    const a = alerts.find((x) => x.id === "classes-without-teacher");
    expect(a).toBeDefined();
    expect(a!.title).toContain("1 class");
  });

  it("does not flag classes with teacher override", () => {
    const alerts = computeAdminAlerts({
      terms: [makeTerm()],
      instances: [
        makeInstance({ id: "bc1", classId: "c99", date: "2026-04-12", teacherOverride1Id: "teacher-x" }),
      ],
      teacherAssignments: [],
      today: "2026-04-10",
    });
    expect(alerts.find((x) => x.id === "classes-without-teacher")).toBeUndefined();
  });

  it("returns schedule-gap when next term has no instances", () => {
    const nextTerm = makeTerm({
      id: "t2",
      name: "Term 2",
      startDate: "2026-05-01",
      endDate: "2026-05-28",
      status: "upcoming",
    });
    const alerts = computeAdminAlerts({
      terms: [makeTerm(), nextTerm],
      instances: [makeInstance({ date: "2026-04-12" })],
      teacherAssignments: [makeAssignment()],
      today: "2026-04-10",
    });
    const a = alerts.find((x) => x.id === "schedule-gap");
    expect(a).toBeDefined();
    expect(a!.message).toContain("Term 2");
  });

  it("does not return schedule-gap when next term has instances", () => {
    const nextTerm = makeTerm({
      id: "t2",
      name: "Term 2",
      startDate: "2026-05-01",
      endDate: "2026-05-28",
      status: "upcoming",
    });
    const alerts = computeAdminAlerts({
      terms: [makeTerm(), nextTerm],
      instances: [
        makeInstance({ date: "2026-04-12" }),
        makeInstance({ id: "bc2", date: "2026-05-05" }),
      ],
      teacherAssignments: [makeAssignment()],
      today: "2026-04-10",
    });
    expect(alerts.find((x) => x.id === "schedule-gap")).toBeUndefined();
  });

  it("returns clean slate when everything is in order", () => {
    const alerts = computeAdminAlerts({
      terms: [
        makeTerm(),
        makeTerm({ id: "t2", name: "Term 2", startDate: "2026-05-01", endDate: "2026-05-28", status: "upcoming" }),
      ],
      instances: [
        makeInstance({ date: "2026-04-12" }),
        makeInstance({ id: "bc2", date: "2026-05-05" }),
      ],
      teacherAssignments: [makeAssignment()],
      today: "2026-04-10",
    });
    expect(alerts.length).toBe(0);
  });

  it("filters out alerts listed in disabledAlertIds", () => {
    const base = {
      terms: [],
      instances: [],
      teacherAssignments: [],
      today: "2026-04-10",
    };
    const allAlerts = computeAdminAlerts(base);
    expect(allAlerts.some((a) => a.id === "no-active-term")).toBe(true);

    const filtered = computeAdminAlerts({ ...base, disabledAlertIds: ["no-active-term"] });
    expect(filtered.some((a) => a.id === "no-active-term")).toBe(false);
  });

  it("returns all alerts when disabledAlertIds is empty", () => {
    const base = {
      terms: [],
      instances: [],
      teacherAssignments: [],
      today: "2026-04-10",
    };
    const allAlerts = computeAdminAlerts(base);
    const withEmpty = computeAdminAlerts({ ...base, disabledAlertIds: [] });
    expect(withEmpty.length).toBe(allAlerts.length);
  });
});
