import { describe, expect, it } from "vitest";
import {
  allowedManualSources,
  allowedManualStatuses,
  canOpenManualAdd,
  manualAddClassIds,
  manualAddDenial,
  type ManualAddCapabilities,
} from "@/lib/domain/manual-attendance";

const NONE: ManualAddCapabilities = { canManualCheckIn: false, canEditHistory: false, canMarkPresent: false, canMarkAbsent: false };
const CHECK_IN: ManualAddCapabilities = { ...NONE, canManualCheckIn: true };
// Guille: Teacher defaults + manual check-in, no edit_history.
const GUILLE: ManualAddCapabilities = { canManualCheckIn: true, canEditHistory: false, canMarkPresent: true, canMarkAbsent: true };
const MARK_ONLY: ManualAddCapabilities = { ...NONE, canMarkPresent: true, canMarkAbsent: true };
const HISTORY: ManualAddCapabilities = { canManualCheckIn: false, canEditHistory: true, canMarkPresent: true, canMarkAbsent: true };

const TODAY = [
  { id: "open", ended: false },
  { id: "ended", ended: true },
];

describe("Add student button", () => {
  it("shows with checkin:manual_checkin when a class is still running today", () => {
    expect(canOpenManualAdd(GUILLE, TODAY)).toBe(true);
    expect(canOpenManualAdd(CHECK_IN, TODAY)).toBe(true);
  });

  it("is hidden with checkin:manual_checkin when every class today has ended or there is none", () => {
    expect(canOpenManualAdd(GUILLE, [{ id: "ended", ended: true }])).toBe(false);
    expect(canOpenManualAdd(GUILLE, [])).toBe(false);
  });

  it("is hidden without checkin:manual_checkin and edit_history, even with mark permissions", () => {
    expect(canOpenManualAdd(MARK_ONLY, TODAY)).toBe(false);
    expect(canOpenManualAdd(NONE, TODAY)).toBe(false);
  });

  it("edit_history keeps its existing button", () => {
    expect(canOpenManualAdd(HISTORY, [])).toBe(true);
  });
});

describe("classes offered", () => {
  it("manual check-in offers only classes that have not ended", () => {
    expect(manualAddClassIds(GUILLE, TODAY)).toEqual(["open"]);
  });

  it("edit_history offers every class today", () => {
    expect(manualAddClassIds(HISTORY, TODAY)).toEqual(["open", "ended"]);
  });

  it("no permission offers nothing", () => {
    expect(manualAddClassIds(MARK_ONLY, TODAY)).toEqual([]);
  });
});

describe("statuses and sources offered", () => {
  it("manual check-in: Present and Late only, no Admin / Manual source", () => {
    expect(allowedManualStatuses(GUILLE, false)).toEqual(["present", "late"]);
    expect(allowedManualSources(GUILLE, false, "present")).toEqual(["subscription", "drop_in", "walk_in"]);
  });

  it("manual check-in on an ended class: nothing", () => {
    expect(allowedManualStatuses(GUILLE, true)).toEqual([]);
  });

  it("edit_history: every status and source the status permissions allow", () => {
    expect(allowedManualStatuses(HISTORY, true)).toEqual(["present", "late", "absent", "excused"]);
    expect(allowedManualSources(HISTORY, true, "absent")).toEqual(["subscription", "drop_in", "walk_in", "admin"]);
    expect(allowedManualStatuses({ ...HISTORY, canMarkAbsent: false }, false)).toEqual(["present", "late", "excused"]);
  });
});

describe("manualAddDenial", () => {
  const base = { status: "present" as const, source: "walk_in" as const, isToday: true, classEnded: false };

  it("an earlier day always goes to Backdate, whatever the permissions", () => {
    for (const caps of [GUILLE, HISTORY, { ...HISTORY, canManualCheckIn: true }]) {
      expect(manualAddDenial({ ...base, caps, isToday: false })).toMatch(/Backdate/);
    }
  });

  it("names the missing permission", () => {
    expect(manualAddDenial({ ...base, caps: MARK_ONLY })).toMatch(/checkin:manual_checkin/);
    expect(manualAddDenial({ ...base, caps: GUILLE, classEnded: true })).toMatch(/edit_history/);
    expect(manualAddDenial({ ...base, caps: GUILLE, status: "absent" })).toMatch(/Present or Late/);
    expect(manualAddDenial({ ...base, caps: GUILLE, source: "admin" })).toMatch(/Admin \/ Manual/);
  });

  it("edit_history without the status permission is not enough", () => {
    expect(manualAddDenial({ ...base, caps: { ...HISTORY, canMarkAbsent: false }, status: "absent" })).not.toBeNull();
  });
});
