/**
 * Phase 19.1 — existing-booking classification.
 *
 * The unsafe assumption being fixed: "a booking row exists, therefore
 * the credit was already spent". That holds for some of BPM's five
 * statuses and not others — every cancel path restores the credit.
 *
 * Verified against the code that actually moves the counters:
 *   booking creation consumes      (bookings-admin.ts, booking.ts)
 *   cancel restores, late or not   (booking-student.ts, bookings-admin.ts)
 *   excused always restores        (attendance.ts::adjustEntitlement)
 *   absent restores only when `refundCreditOnAbsent`
 *   the closure job restores nothing (attendance-closure.ts)
 *
 * `missed` therefore depends on HOW it was reached, which is why the
 * classifier takes the attendance row and the refund rule as inputs.
 * Cases covering that live in `backdated-attendance.test.ts`; this
 * file pins the status matrix under BPM's default (no absent refund).
 */
import { describe, it, expect } from "vitest";
import type { BookingStatus } from "@/types/domain";
import {
  classifyExistingBooking,
  shouldVoidPenaltyOnCorrection,
} from "@/lib/domain/backdated-attendance";

const ALL_STATUSES: BookingStatus[] = [
  "confirmed",
  "checked_in",
  "cancelled",
  "late_cancelled",
  "missed",
];

describe("classifyExistingBooking — the full matrix", () => {
  it.each([
    ["confirmed", "consumed", false],
    ["checked_in", "consumed", false],
    ["cancelled", "restored", true],
    ["late_cancelled", "restored", true],
    // Reinstated, but no credit is due: nothing ever refunded it.
    ["missed", "consumed", true],
  ] as const)(
    "%s → %s (reinstate: %s)",
    (status, expectedState, expectedReinstate) => {
      const c = classifyExistingBooking(status);
      expect(c.state).toBe(expectedState);
      expect(c.needsReinstatement).toBe(expectedReinstate);
    },
  );

  it("classifies EVERY BookingStatus — no silent gaps", () => {
    for (const s of ALL_STATUSES) {
      const c = classifyExistingBooking(s);
      expect(["consumed", "restored", "invalid"]).toContain(c.state);
      expect(c.note.length).toBeGreaterThan(0);
    }
  });

  it("moves a confirmed booking to checked_in without touching credit", () => {
    const c = classifyExistingBooking("confirmed");
    expect(c.state).toBe("consumed");
    expect(c.targetStatus).toBe("checked_in");
  });

  it("leaves an already checked-in booking alone", () => {
    const c = classifyExistingBooking("checked_in");
    expect(c.state).toBe("consumed");
    expect(c.targetStatus).toBeNull();
  });

  it.each(["cancelled", "late_cancelled"] as const)(
    "%s reinstates to checked_in and needs a credit",
    (status) => {
      const c = classifyExistingBooking(status);
      expect(c.state).toBe("restored");
      expect(c.targetStatus).toBe("checked_in");
      expect(c.needsReinstatement).toBe(true);
    },
  );

  it("reinstates a missed booking WITHOUT charging a second credit", () => {
    const c = classifyExistingBooking("missed");
    expect(c.targetStatus).toBe("checked_in");
    expect(c.needsReinstatement).toBe(true);
    expect(c.state).toBe("consumed");
  });

  it("explains the credit consequence in every note", () => {
    expect(classifyExistingBooking("cancelled").note).toMatch(/given back/i);
    expect(classifyExistingBooking("late_cancelled").note).toMatch(/given back/i);
    expect(classifyExistingBooking("missed").note).toMatch(/never given back/i);
    expect(classifyExistingBooking("confirmed").note).toMatch(/already consumed/i);
  });

  it("keeps reinstating the row independent of charging a credit", () => {
    // These were conflated before: `missed` needs its row brought
    // back to checked_in, but the credit behind it was never
    // returned, so charging again would be a double charge.
    const missed = classifyExistingBooking("missed");
    expect(missed.needsReinstatement).toBe(true);
    expect(missed.state).toBe("consumed");

    const cancelled = classifyExistingBooking("cancelled");
    expect(cancelled.needsReinstatement).toBe(true);
    expect(cancelled.state).toBe("restored");
  });

  it("gives every status a definite state and a non-empty note", () => {
    for (const s of ALL_STATUSES) {
      const c = classifyExistingBooking(s);
      expect(["consumed", "restored"]).toContain(c.state);
      expect(c.note.length).toBeGreaterThan(0);
    }
  });
});

describe("shouldVoidPenaltyOnCorrection", () => {
  it("voids when attendance was marked absent", () => {
    expect(shouldVoidPenaltyOnCorrection("confirmed", "absent")).toBe(true);
  });

  it("voids for a late-cancelled booking (late-cancel fee)", () => {
    expect(shouldVoidPenaltyOnCorrection("late_cancelled", null)).toBe(true);
  });

  it("voids for a missed booking (no-show fee)", () => {
    expect(shouldVoidPenaltyOnCorrection("missed", null)).toBe(true);
  });

  it("does NOT void for a plain confirmed booking with no absent mark", () => {
    expect(shouldVoidPenaltyOnCorrection("confirmed", null)).toBe(false);
    expect(shouldVoidPenaltyOnCorrection("checked_in", "present")).toBe(false);
  });

  it("does NOT void for a normal cancellation (no penalty is raised)", () => {
    expect(shouldVoidPenaltyOnCorrection("cancelled", null)).toBe(false);
  });

  it("voids when there is no booking but attendance said absent", () => {
    expect(shouldVoidPenaltyOnCorrection(null, "absent")).toBe(true);
  });

  it("does not void for an excused absence with no booking", () => {
    expect(shouldVoidPenaltyOnCorrection(null, "excused")).toBe(false);
  });
});

// ── The invariant the whole fix protects ────────────────────

describe("invariant: exactly one consumption per attended class", () => {
  /**
   * Models the action's decision: consume when there is no booking,
   * or when the existing booking's credit was restored.
   */
  function willConsume(bookingStatus: BookingStatus | null): boolean {
    if (!bookingStatus) return true;
    return classifyExistingBooking(bookingStatus).state === "restored";
  }

  it("consumes exactly once for a walk-in with no booking", () => {
    expect(willConsume(null)).toBe(true);
  });

  it.each(["confirmed", "checked_in"] as const)(
    "does NOT consume again for a %s booking",
    (s) => {
      expect(willConsume(s)).toBe(false);
    },
  );

  it.each(["cancelled", "late_cancelled"] as const)(
    "DOES consume for a %s booking whose credit was restored",
    (s) => {
      expect(willConsume(s)).toBe(true);
    },
  );

  it("does NOT consume again for a missed booking that kept its credit", () => {
    // The double-charge this invariant exists to prevent: the student
    // paid a credit when booking, no-showed, and nothing refunded it.
    expect(willConsume("missed")).toBe(false);
  });

  it("every status resolves to a definite consume-or-not decision", () => {
    for (const s of [...ALL_STATUSES, null]) {
      expect(typeof willConsume(s)).toBe("boolean");
    }
  });
});
