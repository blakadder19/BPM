import { describe, it, expect, beforeEach } from "vitest";
import { CreditService, type StoredSubscription } from "../credit-service";
import { getAccessRulesMap } from "@/config/product-access";

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

describe("CreditService", () => {
  describe("deductForBooking", () => {
    it("deducts from an unlimited membership without changing credits", () => {
      const service = new CreditService([
        makeSub({ id: "sub-1", productId: "p-gold" }),
      ]);

      const result = service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-1",
        level: "Beginner 1",
        className: "Bachata Beginner 1",
      });

      expect(result.deducted).toBe(true);
      expect(result.subscriptionName).toBe("Gold Membership");
      expect(result.creditsRemaining).toBeNull();
      expect(service.walletTxs).toHaveLength(1);
      expect(service.walletTxs[0].txType).toBe("credit_used");
    });

    it("deducts from a finite credit pack and decrements", () => {
      const service = new CreditService([
        makeSub({
          id: "sub-1",
          productId: "p-dropin",
          productName: "Drop In",
          productType: "drop_in",
          totalCredits: 1,
          remainingCredits: 1,
        }),
      ]);

      const result = service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-6",
        level: "Open",
        className: "Reggaeton Open",
      });

      expect(result.deducted).toBe(true);
      expect(result.creditsRemaining).toBe(0);

      const sub = service.subscriptions[0];
      expect(sub.remainingCredits).toBe(0);
      expect(sub.status).toBe("exhausted");
    });

    it("selects pass before membership (priority order)", () => {
      const service = new CreditService([
        makeSub({ id: "sub-mem", productId: "p-gold", productType: "membership" }),
        makeSub({
          id: "sub-promo",
          productId: "p-beg12",
          productName: "Beginners 1 & 2 Promo Pass",
          productType: "pass",
          totalCredits: 16,
          remainingCredits: 10,
          selectedStyleId: "ds-1",
        }),
      ]);

      const result = service.deductForBooking({
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

    it("falls back to membership when promo does not cover the class style", () => {
      const service = new CreditService([
        makeSub({ id: "sub-mem", productId: "p-gold", productType: "membership" }),
        makeSub({
          id: "sub-promo",
          productId: "p-beg12",
          productName: "Beginners 1 & 2 Promo Pass",
          productType: "pass",
          totalCredits: 16,
          remainingCredits: 10,
          selectedStyleId: "ds-1",
        }),
      ]);

      const result = service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-4",
        level: "Beginner 1",
        className: "Cuban Beginner 1",
        accessRules: getAccessRulesMap(),
      });

      expect(result.deducted).toBe(true);
      expect(result.subscriptionId).toBe("sub-mem");
    });

    it("respects course_group selected styles", () => {
      const service = new CreditService([
        makeSub({
          id: "sub-combo",
          productId: "p-latin-combo",
          productName: "Beginners Latin Combo",
          productType: "pass",
          totalCredits: 16,
          remainingCredits: 5,
          selectedStyleIds: ["ds-1", "ds-5"],
        }),
      ]);

      const rules = getAccessRulesMap();

      const bachata = service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-1",
        level: "Beginner 1",
        className: "Bachata Beginner 1",
        accessRules: rules,
      });
      expect(bachata.deducted).toBe(true);

      const cuban = service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-2",
        classType: "class",
        danceStyleId: "ds-4",
        level: "Beginner 1",
        className: "Cuban Beginner 1",
        accessRules: rules,
      });
      expect(cuban.deducted).toBe(false);
      expect(cuban.reason).toContain("No subscription covers");
    });

    it("returns no deduction when student has no subscriptions", () => {
      const service = new CreditService([]);

      const result = service.deductForBooking({
        studentId: "s-99",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-1",
        level: "Beginner 1",
        className: "Bachata Beginner 1",
      });

      expect(result.deducted).toBe(false);
      expect(result.reason).toContain("No active subscription");
    });

    it("returns no deduction when subscription has 0 credits", () => {
      const service = new CreditService([
        makeSub({
          id: "sub-1",
          productId: "p-dropin",
          productType: "drop_in",
          totalCredits: 1,
          remainingCredits: 0,
          status: "exhausted",
        }),
      ]);

      const result = service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-1",
        level: "Beginner 1",
        className: "Bachata Beginner 1",
      });

      expect(result.deducted).toBe(false);
    });

    it("skips paused subscriptions", () => {
      const service = new CreditService([
        makeSub({ id: "sub-1", productId: "p-gold", status: "paused" }),
      ]);

      const result = service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-1",
        level: "Beginner 1",
        className: "Bachata Beginner 1",
      });

      expect(result.deducted).toBe(false);
    });

    it("creates wallet transaction with correct metadata", () => {
      const service = new CreditService([
        makeSub({
          id: "sub-1",
          productId: "p-beg12",
          productName: "Beginners 1 & 2 Promo Pass",
          productType: "pass",
          totalCredits: 16,
          remainingCredits: 8,
          selectedStyleId: "ds-1",
        }),
      ]);

      service.deductForBooking({
        studentId: "s-1",
        bookingId: "b-1",
        classType: "class",
        danceStyleId: "ds-1",
        level: "Beginner 1",
        className: "Bachata Beginner 1",
      });

      const tx = service.walletTxs[0];
      expect(tx.txType).toBe("credit_used");
      expect(tx.credits).toBe(-1);
      expect(tx.balanceAfter).toBe(7);
      expect(tx.subscriptionId).toBe("sub-1");
      expect(tx.bookingId).toBe("b-1");
      expect(tx.description).toContain("Bachata Beginner 1");
    });
  });

  describe("refundCredit", () => {
    it("refunds a credit and creates wallet transaction", () => {
      const service = new CreditService([
        makeSub({
          id: "sub-1",
          productId: "p-beg12",
          productName: "Beginners 1 & 2 Promo Pass",
          productType: "pass",
          totalCredits: 16,
          remainingCredits: 7,
          selectedStyleId: "ds-1",
        }),
      ]);

      const result = service.refundCredit({
        studentId: "s-1",
        bookingId: "b-1",
        subscriptionId: "sub-1",
        className: "Bachata Beginner 1",
      });

      expect(result.refunded).toBe(true);
      expect(result.creditsRemaining).toBe(8);

      const tx = service.walletTxs[0];
      expect(tx.txType).toBe("credit_refunded");
      expect(tx.credits).toBe(1);
    });

    it("reactivates exhausted subscription on refund", () => {
      const service = new CreditService([
        makeSub({
          id: "sub-1",
          productId: "p-dropin",
          productType: "drop_in",
          totalCredits: 1,
          remainingCredits: 0,
          status: "exhausted",
        }),
      ]);

      service.refundCredit({
        studentId: "s-1",
        bookingId: "b-1",
        subscriptionId: "sub-1",
        className: "Reggaeton Open",
      });

      expect(service.subscriptions[0].remainingCredits).toBe(1);
      expect(service.subscriptions[0].status).toBe("active");
    });

    it("returns failure when subscription not found", () => {
      const service = new CreditService([]);

      const result = service.refundCredit({
        studentId: "s-1",
        bookingId: "b-1",
        subscriptionId: "sub-99",
        className: "Test",
      });

      expect(result.refunded).toBe(false);
    });
  });

  describe("queries", () => {
    let service: CreditService;

    beforeEach(() => {
      service = new CreditService([
        makeSub({ id: "sub-1", studentId: "s-1", productId: "p-gold" }),
        makeSub({ id: "sub-2", studentId: "s-1", productId: "p-dropin", productType: "drop_in", status: "exhausted", totalCredits: 1, remainingCredits: 0 }),
        makeSub({ id: "sub-3", studentId: "s-2", productId: "p-silver" }),
      ]);
    });

    it("getActiveSubscriptionsForStudent returns only active subs", () => {
      const subs = service.getActiveSubscriptionsForStudent("s-1");
      expect(subs).toHaveLength(1);
      expect(subs[0].id).toBe("sub-1");
    });

    it("getAllSubscriptionsForStudent returns all subs", () => {
      const subs = service.getAllSubscriptionsForStudent("s-1");
      expect(subs).toHaveLength(2);
    });

    it("getSubscriptionById finds the right subscription", () => {
      expect(service.getSubscriptionById("sub-3")?.studentId).toBe("s-2");
      expect(service.getSubscriptionById("sub-99")).toBeUndefined();
    });
  });
});
