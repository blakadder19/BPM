/**
 * Phase 2 — pricing-service tests for event-ticket affiliation
 * discounts. These cover the QA acceptance criteria for affiliation-
 * scoped event-ticket pricing end-to-end at the service layer.
 *
 * They focus on the behaviours that combine the engine with the
 * service-layer data loading (active rules + student affiliations):
 *
 *   1. Student with no affiliation → no event-ticket discount.
 *   2. Student with PENDING affiliation → no discount.
 *   3. Student with VERIFIED affiliation → discount applies.
 *   4. Discount only applies to event tickets listed in the rule's
 *      `appliesToEventProductIds` scope.
 *   5. A rule with no event-ticket scope NEVER applies to event
 *      tickets, even if it has product scope set.
 *   6. Guest (studentId === null) → always full price.
 *   7. Subscription-only rules do not leak onto events.
 *   8. The returned snapshot matches the same shape the engine emits
 *      for subscriptions, so the existing serialize/deserialize Stripe
 *      transit round-trips cleanly.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockDiscountRule, MockStudentAffiliation } from "@/lib/mock-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/finance-audit-log", () => ({
  logFinanceEvent: vi.fn(),
}));

let RULES: MockDiscountRule[] = [];
let AFFILIATIONS: MockStudentAffiliation[] = [];

function resetState() {
  RULES = [];
  AFFILIATIONS = [];
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
    async getByStudent(studentId: string) {
      return AFFILIATIONS.filter((a) => a.studentId === studentId);
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
  // Phase 5 — promo-code usage tracking reads event purchases.
  // No promo rule here uses max_uses / one_use_per_email, so an empty
  // events list keeps the existing affiliation tests untouched.
  getSpecialEventRepo: () => ({
    async getAllEvents() {
      return [];
    },
    async getPurchasesByEvent() {
      return [];
    },
  }),
}));

import { priceEventTicketForStudent } from "../pricing-service";

const NOW = "2026-05-15T10:00:00Z";

function hseEventRule(
  overrides: Partial<MockDiscountRule> = {},
): MockDiscountRule {
  return {
    id: "r-hse-ep",
    code: "HSE_EVT_20",
    name: "HSE 20% off QA Event Ticket",
    description: null,
    ruleType: "affiliation",
    affiliationType: "hse",
    discountKind: "percentage",
    discountValue: 20,
    appliesToProductTypes: null,
    appliesToProductIds: null,
    appliesToEventProductIds: ["qa-ticket"],
    minPriceCents: null,
    maxDiscountCents: null,
    isActive: true,
    priority: 10,
    stackable: false,
    validFrom: null,
    validUntil: null,
    firstTimeScope: "any_purchase",
    firstTimeProductIds: null,
    requiresCode: false,
    maxUses: null,
    oneUsePerEmail: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function verifiedHse(studentId: string): MockStudentAffiliation {
  return {
    id: `aff-${studentId}`,
    studentId,
    affiliationType: "hse",
    verificationStatus: "verified",
    verifiedAt: NOW,
    verifiedBy: "admin-1",
    metadata: {},
    validFrom: null,
    validUntil: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function pendingHse(studentId: string): MockStudentAffiliation {
  return { ...verifiedHse(studentId), verificationStatus: "pending" };
}

const QA_TICKET = {
  id: "qa-ticket",
  productType: "full_pass",
  priceCents: 5000,
};
const OTHER_TICKET = {
  id: "other-ticket",
  productType: "full_pass",
  priceCents: 5000,
};

beforeEach(() => {
  resetState();
});

describe("priceEventTicketForStudent — affiliation discounts", () => {
  it("student with no affiliation pays full price", async () => {
    RULES.push(hseEventRule());
    const r = await priceEventTicketForStudent({
      studentId: "s-no-aff",
      product: QA_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(5000);
    expect(r.snapshot).toBeNull();
  });

  it("student with PENDING affiliation pays full price", async () => {
    RULES.push(hseEventRule());
    AFFILIATIONS.push(pendingHse("s-pending"));
    const r = await priceEventTicketForStudent({
      studentId: "s-pending",
      product: QA_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(5000);
  });

  it("student with VERIFIED affiliation gets the discount on the scoped ticket", async () => {
    RULES.push(hseEventRule());
    AFFILIATIONS.push(verifiedHse("s-ok"));
    const r = await priceEventTicketForStudent({
      studentId: "s-ok",
      product: QA_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.totalDiscountCents).toBe(1000);
    expect(r.finalPriceCents).toBe(4000);
    expect(r.snapshot).not.toBeNull();
    expect(r.snapshot!.appliedDiscounts[0]?.affiliationType).toBe("hse");
  });

  it("discount does NOT spill onto unrelated event tickets", async () => {
    RULES.push(hseEventRule());
    AFFILIATIONS.push(verifiedHse("s-ok"));
    const r = await priceEventTicketForStudent({
      studentId: "s-ok",
      product: OTHER_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(OTHER_TICKET.priceCents);
  });

  it("subscription-only rule (no event scope) never applies to event tickets", async () => {
    RULES.push(
      hseEventRule({
        appliesToEventProductIds: null,
        appliesToProductTypes: ["membership"],
      }),
    );
    AFFILIATIONS.push(verifiedHse("s-ok"));
    const r = await priceEventTicketForStudent({
      studentId: "s-ok",
      product: QA_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(QA_TICKET.priceCents);
  });

  it("guest (studentId === null) is always charged full price", async () => {
    RULES.push(hseEventRule());
    AFFILIATIONS.push(verifiedHse("s-other"));
    const r = await priceEventTicketForStudent({
      studentId: null,
      product: QA_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(QA_TICKET.priceCents);
    expect(r.snapshot).toBeNull();
  });

  it("first-time rules do not apply to event tickets in this phase", async () => {
    RULES.push(
      hseEventRule({
        ruleType: "first_time_purchase",
        affiliationType: null,
        appliesToEventProductIds: ["qa-ticket"],
      }),
    );
    const r = await priceEventTicketForStudent({
      studentId: "s-ok",
      product: QA_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(QA_TICKET.priceCents);
  });

  it("inactive rules never apply", async () => {
    RULES.push(hseEventRule({ isActive: false }));
    AFFILIATIONS.push(verifiedHse("s-ok"));
    const r = await priceEventTicketForStudent({
      studentId: "s-ok",
      product: QA_TICKET,
      now: NOW,
    });
    expect(r.appliedDiscounts).toHaveLength(0);
    expect(r.finalPriceCents).toBe(QA_TICKET.priceCents);
  });
});
