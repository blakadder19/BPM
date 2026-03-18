import { describe, it, expect, beforeEach } from "vitest";
import { PenaltyService } from "../penalty-service";
import type { ActiveSubscription } from "@/lib/domain/credit-rules";
import type { ClassType } from "@/types/domain";

function baseCancelParams(overrides: Record<string, unknown> = {}) {
  return {
    studentId: "s-1",
    studentName: "Alice Murphy",
    bookingId: "b-1",
    bookableClassId: "bc-1",
    classTitle: "Bachata Beginner 1",
    classDate: "2026-03-23",
    classStartTime: "19:00",
    classType: "class" as ClassType,
    cancelledAt: new Date("2026-03-23T18:30:00"), // 30 min before — late
    subscriptions: [] as ActiveSubscription[],
    classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    ...overrides,
  };
}

function baseNoShowParams(overrides: Record<string, unknown> = {}) {
  return {
    studentId: "s-1",
    studentName: "Alice Murphy",
    bookingId: "b-1",
    bookableClassId: "bc-1",
    classTitle: "Bachata Beginner 1",
    classDate: "2026-03-23",
    classType: "class" as ClassType,
    subscriptions: [] as ActiveSubscription[],
    classContext: { danceStyleId: "ds-1", level: "Beginner 1" },
    ...overrides,
  };
}

describe("PenaltyService", () => {
  let service: PenaltyService;

  beforeEach(() => {
    service = new PenaltyService();
  });

  describe("assessLateCancelPenalty", () => {
    it("creates a penalty for late cancellation", () => {
      const result = service.assessLateCancelPenalty(baseCancelParams());

      expect(result.penaltyCreated).toBe(true);
      expect(result.penalty).not.toBeNull();
      expect(result.penalty!.reason).toBe("late_cancel");
      expect(result.penalty!.amountCents).toBe(200);
      expect(result.penalty!.resolution).toBe("monetary_pending");
    });

    it("does NOT create penalty for on-time cancellation", () => {
      const result = service.assessLateCancelPenalty(
        baseCancelParams({
          cancelledAt: new Date("2026-03-23T17:00:00"), // 2 hours before
        })
      );

      expect(result.penaltyCreated).toBe(false);
      expect(result.penalty).toBeNull();
      expect(result.description).toContain("On-time");
    });

    it("does NOT create penalty for social class type", () => {
      const result = service.assessLateCancelPenalty(
        baseCancelParams({ classType: "social" as ClassType })
      );

      expect(result.penaltyCreated).toBe(false);
      expect(result.description).toContain("excluded");
    });

    it("does NOT create penalty for student_practice class type", () => {
      const result = service.assessLateCancelPenalty(
        baseCancelParams({ classType: "student_practice" as ClassType })
      );

      expect(result.penaltyCreated).toBe(false);
    });

    it("deducts credit when subscription is available", () => {
      const sub: ActiveSubscription = {
        id: "sub-1",
        productType: "pass",
        remainingCredits: 5,
        danceStyleId: "ds-1",
        allowedLevels: null,
      };

      const result = service.assessLateCancelPenalty(
        baseCancelParams({ subscriptions: [sub] })
      );

      expect(result.penaltyCreated).toBe(true);
      expect(result.penalty!.resolution).toBe("credit_deducted");
      expect(result.penalty!.subscriptionId).toBe("sub-1");
      expect(result.penalty!.creditDeducted).toBe(1);
    });

    it("creates wallet transaction when credit is deducted", () => {
      const sub: ActiveSubscription = {
        id: "sub-1",
        productType: "pass",
        remainingCredits: 5,
        danceStyleId: "ds-1",
        allowedLevels: null,
      };

      const result = service.assessLateCancelPenalty(
        baseCancelParams({ subscriptions: [sub] })
      );

      expect(result.walletTx).not.toBeNull();
      expect(result.walletTx!.txType).toBe("penalty_charged");
      expect(result.walletTx!.credits).toBe(-1);
      expect(result.walletTx!.penaltyId).toBe(result.penalty!.id);

      expect(service.walletTxs).toHaveLength(1);
    });

    it("does NOT create wallet transaction when no credit available", () => {
      const result = service.assessLateCancelPenalty(baseCancelParams());

      expect(result.walletTx).toBeNull();
      expect(service.walletTxs).toHaveLength(0);
    });
  });

  describe("assessNoShowPenalty", () => {
    it("creates a no-show penalty with 500 cents fee", () => {
      const result = service.assessNoShowPenalty(baseNoShowParams());

      expect(result.penaltyCreated).toBe(true);
      expect(result.penalty!.reason).toBe("no_show");
      expect(result.penalty!.amountCents).toBe(500);
    });

    it("excludes social class type from no-show penalty", () => {
      const result = service.assessNoShowPenalty(
        baseNoShowParams({ classType: "social" as ClassType })
      );

      expect(result.penaltyCreated).toBe(false);
    });

    it("deducts credit when subscription is available", () => {
      const sub: ActiveSubscription = {
        id: "sub-1",
        productType: "pass",
        remainingCredits: 3,
        danceStyleId: "ds-1",
        allowedLevels: null,
      };

      const result = service.assessNoShowPenalty(
        baseNoShowParams({ subscriptions: [sub] })
      );

      expect(result.penalty!.resolution).toBe("credit_deducted");
      expect(result.walletTx).not.toBeNull();
    });
  });

  describe("processNoShows", () => {
    it("creates penalties only for absent students", () => {
      const outcomes = service.processNoShows({
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
      expect(outcomes[0].penaltyCreated).toBe(true);
      expect(outcomes[0].penalty!.studentName).toBe("Alice");
      expect(outcomes[1].penalty!.studentName).toBe("Carol");
    });

    it("skips non-bookable class types entirely", () => {
      const outcomes = service.processNoShows({
        bookableClassId: "bc-1",
        classTitle: "Friday Social",
        classDate: "2026-03-23",
        classType: "social",
        classContext: { danceStyleId: null, level: null },
        confirmedBookings: [
          { bookingId: "b-1", studentId: "s-1", studentName: "Alice", subscriptions: [] },
        ],
        absentStudentIds: new Set(["s-1"]),
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].penaltyCreated).toBe(false);
    });
  });

  describe("queries", () => {
    it("getUnresolvedPenalties returns only monetary_pending", () => {
      service.assessLateCancelPenalty(baseCancelParams({ studentId: "s-1" }));
      service.assessLateCancelPenalty(
        baseCancelParams({
          studentId: "s-2",
          subscriptions: [
            {
              id: "sub-1",
              productType: "pass",
              remainingCredits: 5,
              danceStyleId: "ds-1",
              allowedLevels: null,
            },
          ],
        })
      );

      const unresolved = service.getUnresolvedPenalties();
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].studentId).toBe("s-1");
    });

    it("getAllPenalties returns all penalties", () => {
      service.assessLateCancelPenalty(baseCancelParams());
      service.assessNoShowPenalty(baseNoShowParams({ studentId: "s-2" }));

      expect(service.getAllPenalties()).toHaveLength(2);
    });

    it("getPenaltiesForStudent filters by student", () => {
      service.assessLateCancelPenalty(baseCancelParams({ studentId: "s-1" }));
      service.assessNoShowPenalty(baseNoShowParams({ studentId: "s-2" }));

      expect(service.getPenaltiesForStudent("s-1")).toHaveLength(1);
      expect(service.getPenaltiesForStudent("s-2")).toHaveLength(1);
      expect(service.getPenaltiesForStudent("s-99")).toHaveLength(0);
    });
  });
});
