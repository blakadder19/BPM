/**
 * Integration tests for the penalty + credit deduction flow.
 *
 * Wires BookingService, PenaltyService, CreditService, and
 * AttendanceService together (no mocks) to verify:
 *   - late vs on-time cancellation penalties
 *   - no-show penalties from attendance marking
 *   - credit deduction when subscription exists
 *   - monetary_pending fallback when no subscription
 *   - class-only enforcement (socials + student_practice excluded)
 *   - priority ordering with multiple subscriptions
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  BookingService,
  type ClassSnapshot,
} from "@/lib/services/booking-service";
import { PenaltyService } from "@/lib/services/penalty-service";
import {
  CreditService,
  type StoredSubscription,
} from "@/lib/services/credit-service";
import { AttendanceService } from "@/lib/services/attendance-service";
import type { ActiveSubscription } from "@/lib/domain/credit-rules";

// ── Factories ───────────────────────────────────────────────

function makeClass(id: string, overrides: Partial<ClassSnapshot> = {}): ClassSnapshot {
  return {
    id,
    title: "Bachata Beginner 1",
    classType: "class",
    styleName: "Bachata",
    danceStyleRequiresBalance: true,
    status: "open",
    date: "2026-03-23",
    startTime: "19:00",
    endTime: "20:00",
    maxCapacity: 20,
    leaderCap: 10,
    followerCap: 10,
    location: "Studio A",
    ...overrides,
  };
}

function makeSub(overrides: Partial<StoredSubscription> & { id: string }): StoredSubscription {
  return {
    studentId: "s-1",
    productId: "p-gold",
    productName: "Gold Membership",
    productType: "membership",
    status: "active",
    totalCredits: null,
    remainingCredits: null,
    validFrom: "2026-03-01",
    validUntil: "2026-03-31",
    selectedStyleId: null,
    selectedStyleIds: null,
    ...overrides,
  };
}

function toActiveSub(s: StoredSubscription): ActiveSubscription {
  return {
    id: s.id,
    productId: s.productId,
    productType: s.productType,
    remainingCredits: s.remainingCredits,
    danceStyleId: null,
    allowedLevels: null,
    selectedStyleId: s.selectedStyleId,
    selectedStyleIds: s.selectedStyleIds,
  };
}

// ── Cancellation → Penalty Tests ────────────────────────────

describe("Cancellation → Penalty Flow", () => {
  let bookingSvc: BookingService;
  let penaltySvc: PenaltyService;
  let creditSvc: CreditService;

  beforeEach(() => {
    bookingSvc = new BookingService([], [], [
      makeClass("bc-1"),
      makeClass("bc-social", { classType: "social", title: "Friday Social", startTime: "21:00" }),
      makeClass("bc-practice", { classType: "student_practice", title: "Practice Session" }),
    ]);
    penaltySvc = new PenaltyService();
    creditSvc = new CreditService([
      makeSub({
        id: "sub-pack",
        studentId: "s-1",
        productId: "p-dropin",
        productName: "Drop In",
        productType: "drop_in",
        totalCredits: 5,
        remainingCredits: 5,
      }),
    ]);
  });

  it("late cancel → penalty with credit deduction", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: "leader",
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    const cancelledAt = new Date("2026-03-23T18:30:00");
    bookingSvc.cancelBooking(b.bookingId, cancelledAt);

    const subs = creditSvc.getActiveSubscriptionsForStudent("s-1").map(toActiveSub);

    const outcome = penaltySvc.assessLateCancelPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classStartTime: "19:00",
      classType: "class",
      cancelledAt,
      subscriptions: subs,
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    });

    expect(outcome.penaltyCreated).toBe(true);
    expect(outcome.penalty!.reason).toBe("late_cancel");
    expect(outcome.penalty!.amountCents).toBe(200);
    expect(outcome.penalty!.resolution).toBe("credit_deducted");
    expect(outcome.penalty!.subscriptionId).toBe("sub-pack");
    expect(outcome.walletTx).not.toBeNull();
    expect(outcome.walletTx!.txType).toBe("penalty_charged");
  });

  it("on-time cancel → no penalty", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: "leader",
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    const cancelledAt = new Date("2026-03-23T15:00:00");
    bookingSvc.cancelBooking(b.bookingId, cancelledAt);

    const outcome = penaltySvc.assessLateCancelPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classStartTime: "19:00",
      classType: "class",
      cancelledAt,
      subscriptions: [],
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    });

    expect(outcome.penaltyCreated).toBe(false);
    expect(outcome.description).toContain("On-time");
  });

  it("late cancel with no subscription → monetary_pending", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-1",
      studentId: "s-2",
      studentName: "Bob",
      danceRole: "follower",
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    const cancelledAt = new Date("2026-03-23T18:30:00");
    bookingSvc.cancelBooking(b.bookingId, cancelledAt);

    const outcome = penaltySvc.assessLateCancelPenalty({
      studentId: "s-2",
      studentName: "Bob",
      bookingId: b.bookingId,
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classStartTime: "19:00",
      classType: "class",
      cancelledAt,
      subscriptions: [],
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    });

    expect(outcome.penaltyCreated).toBe(true);
    expect(outcome.penalty!.resolution).toBe("monetary_pending");
    expect(outcome.penalty!.amountCents).toBe(200);
    expect(outcome.walletTx).toBeNull();
  });

  it("social late cancel → no penalty regardless of timing", () => {
    const cancelledAt = new Date("2026-03-23T20:55:00");

    const outcome = penaltySvc.assessLateCancelPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: "b-social-1",
      bookableClassId: "bc-social",
      classTitle: "Friday Social",
      classDate: "2026-03-23",
      classStartTime: "21:00",
      classType: "social",
      cancelledAt,
      subscriptions: [],
      classContext: { danceStyleId: null, level: null },
    });

    expect(outcome.penaltyCreated).toBe(false);
    expect(outcome.description).toContain("excluded");
  });

  it("student_practice late cancel → no penalty", () => {
    const cancelledAt = new Date("2026-03-23T18:55:00");

    const outcome = penaltySvc.assessLateCancelPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: "b-practice-1",
      bookableClassId: "bc-practice",
      classTitle: "Practice Session",
      classDate: "2026-03-23",
      classStartTime: "19:00",
      classType: "student_practice",
      cancelledAt,
      subscriptions: [],
      classContext: { danceStyleId: null, level: null },
    });

    expect(outcome.penaltyCreated).toBe(false);
  });

  it("cancellation at exactly the cutoff boundary is NOT late", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: "leader",
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    const cancelledAt = new Date("2026-03-23T18:00:00");
    bookingSvc.cancelBooking(b.bookingId, cancelledAt);

    const outcome = penaltySvc.assessLateCancelPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classStartTime: "19:00",
      classType: "class",
      cancelledAt,
      subscriptions: [],
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    });

    expect(outcome.penaltyCreated).toBe(false);
  });

  it("cancellation 1ms inside the cutoff IS late", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: "leader",
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    const cancelledAt = new Date("2026-03-23T18:00:01");
    bookingSvc.cancelBooking(b.bookingId, cancelledAt);

    const outcome = penaltySvc.assessLateCancelPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classStartTime: "19:00",
      classType: "class",
      cancelledAt,
      subscriptions: [],
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    });

    expect(outcome.penaltyCreated).toBe(true);
  });
});

// ── Attendance → No-Show Penalty Tests ──────────────────────

describe("Attendance → No-Show Penalty Flow", () => {
  let bookingSvc: BookingService;
  let penaltySvc: PenaltyService;
  let attendanceSvc: AttendanceService;

  beforeEach(() => {
    bookingSvc = new BookingService([], [], [makeClass("bc-1")]);
    penaltySvc = new PenaltyService();
    attendanceSvc = new AttendanceService();
  });

  it("absent mark + no-show penalty on class → penalty created", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: "leader",
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    attendanceSvc.markAttendance({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      classTitle: "Bachata Beginner 1",
      date: "2026-03-23",
      status: "absent",
      markedBy: "Teacher",
    });

    const outcome = penaltySvc.assessNoShowPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classType: "class",
      subscriptions: [],
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    });

    expect(outcome.penaltyCreated).toBe(true);
    expect(outcome.penalty!.reason).toBe("no_show");
    expect(outcome.penalty!.amountCents).toBe(500);
  });

  it("present mark + check-in → no penalty needed", () => {
    const b = bookingSvc.bookClass({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      danceRole: "leader",
    });
    if (b.type !== "confirmed") throw new Error("Expected confirmed");

    attendanceSvc.markAttendance({
      bookableClassId: "bc-1",
      studentId: "s-1",
      studentName: "Alice",
      bookingId: b.bookingId,
      classTitle: "Bachata Beginner 1",
      date: "2026-03-23",
      status: "present",
      markedBy: "Teacher",
    });

    bookingSvc.checkInBooking(b.bookingId);

    expect(bookingSvc.getConfirmedBookingsForClass("bc-1")[0].status).toBe("checked_in");
    expect(penaltySvc.getAllPenalties()).toHaveLength(0);
  });

  it("no-show on social → no penalty", () => {
    const outcome = penaltySvc.assessNoShowPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: "b-social",
      bookableClassId: "bc-social",
      classTitle: "Friday Social",
      classDate: "2026-03-23",
      classType: "social",
      subscriptions: [],
      classContext: { danceStyleId: null, level: null },
    });

    expect(outcome.penaltyCreated).toBe(false);
  });

  it("no-show on student_practice → no penalty", () => {
    const outcome = penaltySvc.assessNoShowPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: "b-practice",
      bookableClassId: "bc-practice",
      classTitle: "Practice Session",
      classDate: "2026-03-23",
      classType: "student_practice",
      subscriptions: [],
      classContext: { danceStyleId: null, level: null },
    });

    expect(outcome.penaltyCreated).toBe(false);
  });

  it("no-show penalty with credit deduction uses subscription", () => {
    const creditSvc = new CreditService([
      makeSub({
        id: "sub-1",
        studentId: "s-1",
        productId: "p-dropin",
        productName: "Drop In",
        productType: "drop_in",
        totalCredits: 3,
        remainingCredits: 3,
      }),
    ]);

    const subs = creditSvc.getActiveSubscriptionsForStudent("s-1").map(toActiveSub);

    const outcome = penaltySvc.assessNoShowPenalty({
      studentId: "s-1",
      studentName: "Alice",
      bookingId: "b-1",
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classType: "class",
      subscriptions: subs,
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    });

    expect(outcome.penaltyCreated).toBe(true);
    expect(outcome.penalty!.resolution).toBe("credit_deducted");
    expect(outcome.walletTx!.txType).toBe("penalty_charged");
  });

  it("batch no-show creates penalties only for absent students", () => {
    const outcomes = penaltySvc.processNoShows({
      bookableClassId: "bc-1",
      classTitle: "Bachata Beginner 1",
      classDate: "2026-03-23",
      classType: "class",
      classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
      confirmedBookings: [
        { bookingId: "b-1", studentId: "s-1", studentName: "Alice", subscriptions: [] },
        { bookingId: "b-2", studentId: "s-2", studentName: "Bob", subscriptions: [] },
        { bookingId: "b-3", studentId: "s-3", studentName: "Carol", subscriptions: [] },
      ],
      absentStudentIds: new Set(["s-1", "s-3"]),
    });

    expect(outcomes).toHaveLength(2);
    const penalized = outcomes.filter((o) => o.penaltyCreated);
    expect(penalized).toHaveLength(2);
    expect(penalized.map((o) => o.penalty!.studentName).sort()).toEqual(["Alice", "Carol"]);
  });
});

// ── Credit Deduction Priority ───────────────────────────────

describe("Credit Deduction — Priority & Access Rules", () => {
  it("follows priority: promo_pass > pack > drop_in > membership", () => {
    const creditSvc = new CreditService([
      makeSub({ id: "sub-mem", studentId: "s-1", productId: "p-gold", productType: "membership" }),
      makeSub({
        id: "sub-pack",
        studentId: "s-1",
        productId: "p-dropin",
        productName: "Drop In",
        productType: "drop_in",
        totalCredits: 5,
        remainingCredits: 5,
      }),
      makeSub({
        id: "sub-promo",
        studentId: "s-1",
        productId: "p-beg12",
        productName: "Beginners 1 & 2",
        productType: "promo_pass",
        totalCredits: 16,
        remainingCredits: 10,
        selectedStyleId: "ds-1",
      }),
    ]);

    const result = creditSvc.deductForBooking({
      studentId: "s-1",
      bookingId: "b-1",
      classType: "class",
      danceStyleId: "ds-1",
      level: "Beginner 1",
      className: "Bachata Beginner 1",
    });

    expect(result.deducted).toBe(true);
    expect(result.subscriptionId).toBe("sub-promo");
  });

  it("skips promo_pass when style doesn't match, falls to next", () => {
    const creditSvc = new CreditService([
      makeSub({ id: "sub-mem", studentId: "s-1", productId: "p-gold", productType: "membership" }),
      makeSub({
        id: "sub-promo",
        studentId: "s-1",
        productId: "p-beg12",
        productName: "Beginners 1 & 2",
        productType: "promo_pass",
        totalCredits: 16,
        remainingCredits: 10,
        selectedStyleId: "ds-1",
      }),
    ]);

    const result = creditSvc.deductForBooking({
      studentId: "s-1",
      bookingId: "b-1",
      classType: "class",
      danceStyleId: "ds-4",
      level: "Beginner 1",
      className: "Cuban Beginner 1",
    });

    expect(result.deducted).toBe(true);
    expect(result.subscriptionId).toBe("sub-mem");
  });

  it("course_group subscription only covers selected styles", () => {
    const creditSvc = new CreditService([
      makeSub({
        id: "sub-combo",
        studentId: "s-1",
        productId: "p-latin-combo",
        productName: "Latin Combo",
        productType: "promo_pass",
        totalCredits: 16,
        remainingCredits: 5,
        selectedStyleIds: ["ds-1", "ds-5"],
      }),
    ]);

    const bachata = creditSvc.deductForBooking({
      studentId: "s-1",
      bookingId: "b-1",
      classType: "class",
      danceStyleId: "ds-1",
      level: "Beginner 1",
      className: "Bachata Beginner 1",
    });
    expect(bachata.deducted).toBe(true);

    const cuban = creditSvc.deductForBooking({
      studentId: "s-1",
      bookingId: "b-2",
      classType: "class",
      danceStyleId: "ds-4",
      level: "Beginner 1",
      className: "Cuban Beginner 1",
    });
    expect(cuban.deducted).toBe(false);
    expect(cuban.reason).toContain("No subscription covers");
  });

  it("exhausting credits sets subscription to exhausted", () => {
    const creditSvc = new CreditService([
      makeSub({
        id: "sub-1",
        studentId: "s-1",
        productId: "p-dropin",
        productName: "Drop In",
        productType: "drop_in",
        totalCredits: 1,
        remainingCredits: 1,
      }),
    ]);

    creditSvc.deductForBooking({
      studentId: "s-1",
      bookingId: "b-1",
      classType: "class",
      danceStyleId: "ds-6",
      level: null,
      className: "Reggaeton Open",
    });

    expect(creditSvc.subscriptions[0].remainingCredits).toBe(0);
    expect(creditSvc.subscriptions[0].status).toBe("exhausted");
  });

  it("refund after deduction restores credit and reactivates subscription", () => {
    const creditSvc = new CreditService([
      makeSub({
        id: "sub-1",
        studentId: "s-1",
        productId: "p-dropin",
        productName: "Drop In",
        productType: "drop_in",
        totalCredits: 1,
        remainingCredits: 1,
      }),
    ]);

    creditSvc.deductForBooking({
      studentId: "s-1",
      bookingId: "b-1",
      classType: "class",
      danceStyleId: "ds-6",
      level: null,
      className: "Reggaeton Open",
    });

    expect(creditSvc.subscriptions[0].status).toBe("exhausted");

    creditSvc.refundCredit({
      studentId: "s-1",
      bookingId: "b-1",
      subscriptionId: "sub-1",
      className: "Reggaeton Open",
    });

    expect(creditSvc.subscriptions[0].remainingCredits).toBe(1);
    expect(creditSvc.subscriptions[0].status).toBe("active");
  });

  it("wallet transactions are created for each deduction and refund", () => {
    const creditSvc = new CreditService([
      makeSub({
        id: "sub-1",
        studentId: "s-1",
        productId: "p-dropin",
        productName: "Drop In",
        productType: "drop_in",
        totalCredits: 5,
        remainingCredits: 5,
      }),
    ]);

    creditSvc.deductForBooking({
      studentId: "s-1",
      bookingId: "b-1",
      classType: "class",
      danceStyleId: "ds-1",
      level: "Beginner 1",
      className: "Bachata Beginner 1",
    });

    creditSvc.refundCredit({
      studentId: "s-1",
      bookingId: "b-1",
      subscriptionId: "sub-1",
      className: "Bachata Beginner 1",
    });

    expect(creditSvc.walletTxs).toHaveLength(2);
    expect(creditSvc.walletTxs[0].txType).toBe("credit_used");
    expect(creditSvc.walletTxs[0].credits).toBe(-1);
    expect(creditSvc.walletTxs[1].txType).toBe("credit_refunded");
    expect(creditSvc.walletTxs[1].credits).toBe(1);
  });
});
