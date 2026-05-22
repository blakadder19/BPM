/**
 * Phase 5 — pricing-service tests for event-ticket promo codes.
 *
 * Covers the service-layer enforcement of:
 *   * max_uses          — paid+pending event purchases counted against
 *                         the rule's snapshot ruleId.
 *   * one_use_per_email — same student id (logged-in) or same
 *                         normalised guest email cannot reuse the code.
 *
 * The pure engine cases (matched code, expired, scope) live in
 * `lib/domain/__tests__/pricing-engine.test.ts`. Here we wire the
 * engine to a fake repo layer so the count / dedupe gates can be
 * observed end-to-end.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockDiscountRule } from "@/lib/mock-data";
import type { AppliedDiscountSnapshot } from "@/lib/domain/pricing-engine";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/finance-audit-log", () => ({
  logFinanceEvent: vi.fn(),
}));

let RULES: MockDiscountRule[] = [];

interface FakePurchase {
  id: string;
  studentId: string | null;
  guestEmail: string | null;
  paymentStatus: "paid" | "pending" | "refunded";
  appliedDiscount: AppliedDiscountSnapshot | null;
}
let PURCHASES: FakePurchase[] = [];

function resetState() {
  RULES = [];
  PURCHASES = [];
}

vi.mock("@/lib/repositories", () => ({
  getDiscountRuleRepo: () => ({
    async getActive() {
      return RULES.filter((r) => r.isActive);
    },
    async getAll() {
      return [...RULES];
    },
    async getById(id: string) {
      return RULES.find((r) => r.id === id) ?? null;
    },
  }),
  getAffiliationRepo: () => ({
    async getByStudent() {
      return [];
    },
  }),
  getSubscriptionRepo: () => ({
    async getByStudent() {
      return [];
    },
  }),
  getDiscountClaimRepo: () => ({
    async findActiveForRule() {
      return null;
    },
  }),
  getSpecialEventRepo: () => ({
    async getAllEvents() {
      return [{ id: "evt-1", title: "Event" }];
    },
    async getPurchasesByEvent() {
      return PURCHASES;
    },
  }),
}));

import { priceEventTicketForStudent } from "../pricing-service";

const NOW = "2026-05-15T10:00:00Z";
const TICKET = {
  id: "ep-promo",
  productType: "drop_in",
  priceCents: 5000,
};

function promoRule(overrides: Partial<MockDiscountRule> = {}): MockDiscountRule {
  return {
    id: "r-promo",
    code: "ANGELICA10",
    name: "Angelica 10% off",
    description: null,
    ruleType: "event_promo_code",
    affiliationType: null,
    discountKind: "percentage",
    discountValue: 10,
    appliesToProductTypes: null,
    appliesToProductIds: null,
    appliesToEventProductIds: [TICKET.id],
    minPriceCents: null,
    maxDiscountCents: null,
    isActive: true,
    priority: 0,
    stackable: false,
    validFrom: null,
    validUntil: null,
    firstTimeScope: "any_purchase",
    firstTimeProductIds: null,
    requiresCode: true,
    maxUses: null,
    oneUsePerEmail: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function priorPurchaseUsing(
  ruleId: string,
  overrides: Partial<FakePurchase> = {},
): FakePurchase {
  return {
    id: `pur-${Math.random().toString(36).slice(2, 8)}`,
    studentId: null,
    guestEmail: null,
    paymentStatus: "paid",
    appliedDiscount: {
      appliedAt: NOW,
      basePriceCents: TICKET.priceCents,
      totalDiscountCents: 500,
      finalPriceCents: 4500,
      appliedDiscounts: [
        {
          ruleId,
          code: "ANGELICA10",
          name: "Angelica 10% off",
          ruleType: "event_promo_code",
          discountKind: "percentage",
          discountValue: 10,
          amountCents: 500,
          affiliationType: null,
          affiliationId: null,
          reason: "Promo code ANGELICA10",
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetState();
});

describe("priceEventTicketForStudent — promo codes (service)", () => {
  it("guest can apply a valid promo code even with no student id", async () => {
    RULES.push(promoRule());
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: TICKET,
      promoCode: "ANGELICA10",
      guestEmail: "fan@example.com",
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.finalPriceCents).toBe(4500);
    expect(r.promoCodeError).toBeNull();
    expect(r.snapshot).not.toBeNull();
  });

  it("unknown code returns a clear error and no discount", async () => {
    RULES.push(promoRule());
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: TICKET,
      promoCode: "WRONG",
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(TICKET.priceCents);
    expect(r.promoCodeError?.kind).toBe("unknown_code");
  });

  it("expired code returns 'expired'", async () => {
    RULES.push(promoRule({ validUntil: "2026-05-14T00:00:00Z" }));
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: TICKET,
      promoCode: "ANGELICA10",
      now: NOW,
    });
    expect(r.promoCodeError?.kind).toBe("expired");
  });

  it("max_uses cap: rejects once paid+pending count reaches the cap", async () => {
    RULES.push(promoRule({ maxUses: 2 }));
    PURCHASES.push(
      priorPurchaseUsing("r-promo", { paymentStatus: "paid" }),
      priorPurchaseUsing("r-promo", { paymentStatus: "pending" }),
    );
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: TICKET,
      promoCode: "ANGELICA10",
      guestEmail: "new@example.com",
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(TICKET.priceCents);
    expect(r.promoCodeError?.kind).toBe("max_uses_reached");
  });

  it("max_uses cap: refunded purchases do NOT count against it", async () => {
    RULES.push(promoRule({ maxUses: 2 }));
    PURCHASES.push(
      priorPurchaseUsing("r-promo", { paymentStatus: "refunded" }),
      priorPurchaseUsing("r-promo", { paymentStatus: "refunded" }),
    );
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: TICKET,
      promoCode: "ANGELICA10",
      guestEmail: "new@example.com",
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.promoCodeError).toBeNull();
  });

  it("one_use_per_email: same logged-in student cannot reuse the code", async () => {
    RULES.push(promoRule({ oneUsePerEmail: true }));
    PURCHASES.push(
      priorPurchaseUsing("r-promo", {
        studentId: "stu-1",
        paymentStatus: "paid",
      }),
    );
    const r = await priceEventTicketForStudent({
      studentId: "stu-1",
      product: TICKET,
      promoCode: "ANGELICA10",
      now: NOW,
    });
    expect(r.promoCodeError?.kind).toBe("already_used");
    expect(r.appliedDiscounts).toHaveLength(0);
  });

  it("one_use_per_email: a different student can still use the code", async () => {
    RULES.push(promoRule({ oneUsePerEmail: true }));
    PURCHASES.push(
      priorPurchaseUsing("r-promo", {
        studentId: "stu-1",
        paymentStatus: "paid",
      }),
    );
    const r = await priceEventTicketForStudent({
      studentId: "stu-2",
      product: TICKET,
      promoCode: "ANGELICA10",
      now: NOW,
    });
    expect(r.promoCodeError).toBeNull();
    expect(r.appliedDiscounts).toHaveLength(1);
  });

  it("one_use_per_email: same guest email cannot reuse the code", async () => {
    RULES.push(promoRule({ oneUsePerEmail: true }));
    PURCHASES.push(
      priorPurchaseUsing("r-promo", {
        guestEmail: "fan@example.com",
        paymentStatus: "paid",
      }),
    );
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: TICKET,
      promoCode: "ANGELICA10",
      guestEmail: "FAN@Example.com", // normaliser strips case
      now: NOW,
    });
    expect(r.promoCodeError?.kind).toBe("already_used");
  });

  it("one_use_per_email: guest with no email gets a 'guest_email_required' error", async () => {
    RULES.push(promoRule({ oneUsePerEmail: true }));
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: TICKET,
      promoCode: "ANGELICA10",
      now: NOW,
    });
    expect(r.promoCodeError?.kind).toBe("guest_email_required");
  });
});
