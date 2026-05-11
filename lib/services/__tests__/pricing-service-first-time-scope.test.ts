/**
 * End-to-end-ish tests for the per-rule first-time scope behaviour
 * implemented in 00064. The pricing-service is the gluelayer that
 *   1) loads rules + claims + prior subs,
 *   2) builds the per-rule first-time eligibility map,
 *   3) hands the map to the pure pricing engine,
 *   4) atomically claims when commit-mode is used.
 *
 * These tests cover the QA acceptance criteria A-G from the spec:
 *   A. Out-of-scope first purchase → no discount, no claim consumed.
 *   B. In-scope first purchase → discount applies.
 *   C. Commit mode persists the claim and freezes the snapshot.
 *   D. Second in-scope purchase by the same student → no discount.
 *   E. Independent students: a different student's out-of-scope
 *      purchase doesn't poison anyone else's first-time eligibility.
 *   F. Refunds (claim release outside this layer) keep the legacy
 *      "no reopen" behaviour: prior in-scope paid sub still blocks.
 *   G. Switching the rule scope from "selected_products" to
 *      "any_purchase" changes both preview and commit behaviour.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockDiscountRule } from "@/lib/mock-data";

// Stub server-only and finance audit log so the module graph imports cleanly.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/finance-audit-log", () => ({
  logFinanceEvent: vi.fn(),
}));

// --- In-memory fakes ----------------------------------------------------

type Sub = {
  id: string;
  studentId: string;
  productId: string;
  paymentStatus: "paid" | "pending" | "unpaid" | "refunded" | "cancelled";
  appliedDiscount?: unknown;
};

type Claim = {
  id: string;
  studentId: string;
  claimType: string;
  ruleId: string | null;
  source: string;
  relatedSubscriptionId: string | null;
  relatedSessionId: string | null;
  releasedAt: string | null;
  releasedReason: string | null;
  claimedAt: string;
  createdAt: string;
  updatedAt: string;
};

let RULES: MockDiscountRule[] = [];
const SUBS: Sub[] = [];
const CLAIMS: Claim[] = [];
let CLAIM_SEQ = 0;

function resetState() {
  RULES = [];
  SUBS.length = 0;
  CLAIMS.length = 0;
  CLAIM_SEQ = 0;
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
    async getByStudent(studentId: string) {
      return SUBS.filter((s) => s.studentId === studentId);
    },
  }),
  getDiscountClaimRepo: () => ({
    async findActive(studentId: string, claimType: string) {
      return (
        CLAIMS.find(
          (c) =>
            c.studentId === studentId &&
            c.claimType === claimType &&
            c.releasedAt === null,
        ) ?? null
      );
    },
    async findActiveForRule(studentId: string, ruleId: string) {
      return (
        CLAIMS.find(
          (c) =>
            c.studentId === studentId &&
            c.ruleId === ruleId &&
            c.releasedAt === null,
        ) ?? null
      );
    },
    async tryCreate(input: {
      studentId: string;
      claimType: string;
      ruleId: string | null;
      source: string;
      relatedSessionId?: string | null;
      relatedSubscriptionId?: string | null;
    }) {
      const existing = CLAIMS.find((c) => {
        if (c.releasedAt !== null) return false;
        if (c.studentId !== input.studentId) return false;
        if (c.claimType !== input.claimType) return false;
        if (c.ruleId === null) return true;
        if (input.ruleId === null) return true;
        return c.ruleId === input.ruleId;
      });
      if (existing) {
        return { granted: false, claim: null, existingClaim: existing };
      }
      const now = new Date().toISOString();
      const claim: Claim = {
        id: `cl-${++CLAIM_SEQ}`,
        studentId: input.studentId,
        claimType: input.claimType,
        ruleId: input.ruleId,
        source: input.source,
        relatedSubscriptionId: input.relatedSubscriptionId ?? null,
        relatedSessionId: input.relatedSessionId ?? null,
        releasedAt: null,
        releasedReason: null,
        claimedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      CLAIMS.push(claim);
      return { granted: true, claim, existingClaim: null };
    },
    async release(id: string, reason: string) {
      const c = CLAIMS.find((x) => x.id === id);
      if (!c || c.releasedAt) return false;
      c.releasedAt = new Date().toISOString();
      c.releasedReason = reason;
      return true;
    },
    async setRelated() {
      return true;
    },
    async getById(id: string) {
      return CLAIMS.find((c) => c.id === id) ?? null;
    },
  }),
}));

// Helpers --------------------------------------------------------------

function beginnersRule(): MockDiscountRule {
  return {
    id: "r-beg",
    code: "BEG_10",
    name: "Beginners first-time 10% off",
    description: null,
    ruleType: "first_time_purchase",
    affiliationType: null,
    discountKind: "percentage",
    discountValue: 10,
    appliesToProductTypes: null,
    appliesToProductIds: ["p-beginners"],
    minPriceCents: null,
    maxDiscountCents: null,
    isActive: true,
    priority: 5,
    stackable: false,
    validFrom: null,
    validUntil: null,
    firstTimeScope: "selected_products",
    firstTimeProductIds: ["p-beginners"],
    createdAt: "2026-04-01T00:00:00",
    updatedAt: "2026-04-01T00:00:00",
  };
}

const BEGINNERS = {
  id: "p-beginners",
  productType: "pass" as const,
  priceCents: 10000,
};
const YOGA = {
  id: "p-yoga",
  productType: "membership" as const,
  priceCents: 5000,
};

const importSvc = () => import("@/lib/services/pricing-service");

beforeEach(() => {
  resetState();
});

describe("pricing-service — first-time scope (selected_products)", () => {
  it("Test A: out-of-scope first purchase yields no discount and no claim", async () => {
    RULES = [beginnersRule()];
    const { priceProductForStudent } = await importSvc();

    const r = await priceProductForStudent({
      studentId: "stu-A",
      product: YOGA,
      commit: { source: "catalog_purchase" },
    });

    expect(r.appliedDiscounts).toEqual([]);
    expect(r.finalPriceCents).toBe(5000);
    expect(CLAIMS).toHaveLength(0);
  });

  it("Test B: in-scope first purchase yields the discount in preview", async () => {
    RULES = [beginnersRule()];
    const { previewPricingForStudent } = await importSvc();

    const map = await previewPricingForStudent({
      studentId: "stu-B",
      products: [BEGINNERS],
    });
    const r = map.get(BEGINNERS.id)!;
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.finalPriceCents).toBe(9000);
    expect(CLAIMS).toHaveLength(0); // preview never claims
  });

  it("Test C: committing the in-scope purchase persists the per-rule claim", async () => {
    RULES = [beginnersRule()];
    const { priceProductForStudent } = await importSvc();

    const r = await priceProductForStudent({
      studentId: "stu-C",
      product: BEGINNERS,
      commit: { source: "catalog_purchase" },
    });

    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.appliedDiscounts[0]?.code).toBe("BEG_10");
    expect(r.snapshot).not.toBeNull();
    expect(r.claim?.ruleId).toBe("r-beg");
    expect(CLAIMS).toHaveLength(1);
  });

  it("Test D: a second in-scope purchase by the same student gets no discount", async () => {
    RULES = [beginnersRule()];
    const { priceProductForStudent } = await importSvc();

    // First purchase: consume the claim.
    await priceProductForStudent({
      studentId: "stu-D",
      product: BEGINNERS,
      commit: { source: "catalog_purchase" },
    });
    // Pretend the prior purchase landed in the subs table with the
    // frozen snapshot (mirrors what createPurchaseSubscription does).
    SUBS.push({
      id: "sub-D-1",
      studentId: "stu-D",
      productId: BEGINNERS.id,
      paymentStatus: "paid",
      appliedDiscount: {
        appliedAt: "now",
        basePriceCents: 10000,
        totalDiscountCents: 1000,
        finalPriceCents: 9000,
        appliedDiscounts: [{ ruleId: "r-beg" }],
      },
    });

    const r = await priceProductForStudent({
      studentId: "stu-D",
      product: BEGINNERS,
      commit: { source: "catalog_purchase" },
    });

    expect(r.appliedDiscounts).toEqual([]);
    expect(r.finalPriceCents).toBe(10000);
    expect(CLAIMS).toHaveLength(1); // unchanged
  });

  it("Test E: a different student is unaffected by anyone else's prior out-of-scope purchase", async () => {
    RULES = [beginnersRule()];

    SUBS.push({
      id: "sub-other",
      studentId: "stu-other",
      productId: YOGA.id,
      paymentStatus: "paid",
    });

    const { previewPricingForStudent } = await importSvc();

    // The other student's Yoga purchase must NOT have consumed
    // stu-E's Beginners first-time eligibility (different student).
    const map = await previewPricingForStudent({
      studentId: "stu-E",
      products: [BEGINNERS],
    });
    const r = map.get(BEGINNERS.id)!;
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.finalPriceCents).toBe(9000);
  });

  it("Test E (continued): a student's own prior YOGA purchase does NOT consume their Beginners first-time", async () => {
    RULES = [beginnersRule()];

    SUBS.push({
      id: "sub-stuE-yoga",
      studentId: "stu-E",
      productId: YOGA.id,
      paymentStatus: "paid",
    });

    const { previewPricingForStudent } = await importSvc();
    const map = await previewPricingForStudent({
      studentId: "stu-E",
      products: [BEGINNERS],
    });
    const r = map.get(BEGINNERS.id)!;
    expect(r.appliedDiscounts).toHaveLength(1);
    expect(r.finalPriceCents).toBe(9000);
  });

  it("Test F: a refunded prior purchase still blocks (no-reopen)", async () => {
    RULES = [beginnersRule()];
    // The user marked the in-scope purchase refunded — but the claim
    // remains active (no auto-release on refund), so the student is
    // still considered to have consumed first-time.
    CLAIMS.push({
      id: "cl-prior",
      studentId: "stu-F",
      claimType: "first_time_purchase",
      ruleId: "r-beg",
      source: "stripe_checkout",
      relatedSubscriptionId: "sub-F-1",
      relatedSessionId: null,
      releasedAt: null,
      releasedReason: null,
      claimedAt: "2026-03-01T00:00:00",
      createdAt: "2026-03-01T00:00:00",
      updatedAt: "2026-03-01T00:00:00",
    });

    const { previewPricingForStudent } = await importSvc();
    const map = await previewPricingForStudent({
      studentId: "stu-F",
      products: [BEGINNERS],
    });
    const r = map.get(BEGINNERS.id)!;
    expect(r.appliedDiscounts).toEqual([]);
  });

  it("Test G: switching the rule to any_purchase makes ANY first purchase eligible", async () => {
    RULES = [
      {
        ...beginnersRule(),
        firstTimeScope: "any_purchase",
        firstTimeProductIds: null,
        appliesToProductIds: null,
      },
    ];

    const { previewPricingForStudent } = await importSvc();

    const yoga = await previewPricingForStudent({
      studentId: "stu-G",
      products: [YOGA],
    });
    expect(yoga.get(YOGA.id)!.appliedDiscounts).toHaveLength(1);

    const beg = await previewPricingForStudent({
      studentId: "stu-G",
      products: [BEGINNERS],
    });
    expect(beg.get(BEGINNERS.id)!.appliedDiscounts).toHaveLength(1);
  });

  it("two coexisting first-time rules with disjoint scopes each grant independently", async () => {
    const yogaRule: MockDiscountRule = {
      ...beginnersRule(),
      id: "r-yoga",
      code: "YOGA_15",
      name: "Yoga first-time 15% off",
      discountValue: 15,
      appliesToProductIds: ["p-yoga"],
      firstTimeScope: "selected_products",
      firstTimeProductIds: ["p-yoga"],
    };
    RULES = [beginnersRule(), yogaRule];
    const { priceProductForStudent } = await importSvc();

    const beg = await priceProductForStudent({
      studentId: "stu-multi",
      product: BEGINNERS,
      commit: { source: "catalog_purchase" },
    });
    expect(beg.appliedDiscounts[0]?.code).toBe("BEG_10");

    const yoga = await priceProductForStudent({
      studentId: "stu-multi",
      product: YOGA,
      commit: { source: "catalog_purchase" },
    });
    expect(yoga.appliedDiscounts[0]?.code).toBe("YOGA_15");

    expect(CLAIMS).toHaveLength(2);
    expect(CLAIMS.map((c) => c.ruleId).sort()).toEqual(["r-beg", "r-yoga"]);
  });
});
