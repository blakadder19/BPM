/**
 * Pricing service — Phase 4 server-side glue.
 *
 * SOURCE-OF-TRUTH INVARIANT (do NOT break):
 *   BPM calculates, Stripe charges, webhook persists the frozen result.
 *
 *   1. BPM is the only system that decides what a student pays.
 *      Stripe coupons / promotion codes are NEVER used as the source.
 *   2. Every commit path (catalog self-purchase, admin manual assign,
 *      QR drop-in sale, Stripe checkout creation, pay-existing-pending)
 *      calls `priceProductForStudent({ commit })`. The first-time
 *      atomic claim is recorded BEFORE the charge or row is finalised.
 *   3. The Stripe Checkout Session is created with `unit_amount =
 *      pricing.finalPriceCents` and the compact frozen snapshot is
 *      stuffed into session metadata via `serializePricingForStripe`.
 *   4. The Stripe webhook fulfillment path passes that frozen snapshot
 *      verbatim into `createPurchaseSubscription` so the persisted
 *      `priceCentsAtPurchase` / `originalPriceCents` / `appliedDiscount`
 *      can never drift from what the customer was actually charged.
 *   5. Display surfaces (catalog cards, dashboard previews,
 *      `/discount-rules` preview tool) use `previewPricingForStudent`,
 *      which runs the SAME engine but does NOT record an atomic claim
 *      and does NOT persist anything. They are advisory only — never
 *      the source of any subscription row.
 *
 * Loads active discount rules + the student's affiliations + the
 * first-time-paid flag, then delegates to the pure pricing engine.
 *
 * Used by every purchase entry point (catalog, admin manual assignment,
 * QR drop-in sale, Stripe checkout preparation) so they share one
 * deterministic discount evaluation. Renewals deliberately do NOT call
 * this — they inherit the parent's frozen appliedDiscount snapshot.
 */
import "server-only";

import {
  getAffiliationRepo,
  getDiscountRuleRepo,
  getSubscriptionRepo,
  getDiscountClaimRepo,
} from "@/lib/repositories";
import {
  applyPricing,
  type AppliedDiscount,
  type AppliedDiscountSnapshot,
  type DiscountRule,
  type PricingProduct,
  type PricingResult,
  type StudentAffiliation,
} from "@/lib/domain/pricing-engine";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import type { MockDiscountRule, MockStudentAffiliation } from "@/lib/mock-data";
import type {
  ClaimSource,
  DiscountClaim,
} from "@/lib/services/discount-claim-store";

export interface PriceForStudentInput {
  studentId: string;
  product: PricingProduct;
  /** Override "now" for tests / deterministic backfills. */
  now?: string;
  /** When true, bypass the "first paid subscription" lookup and treat as not-first. */
  skipFirstTimeCheck?: boolean;
  /**
   * Commit mode: when present, atomically claim eligibility for any
   * one-time discount (currently first_time_purchase) BEFORE the result
   * is returned. If the atomic claim fails the engine is re-run without
   * the contested discount so the caller never returns a "discount
   * applied but not claimed" result. Required for any code path that
   * actually creates a charge or persists a subscription with the
   * resulting price.
   */
  commit?: {
    source: ClaimSource;
    relatedSessionId?: string | null;
    relatedSubscriptionId?: string | null;
  };
}

export interface PriceForStudentResult extends PricingResult {
  /** Snapshot ready to freeze on the resulting subscription row. */
  snapshot: AppliedDiscountSnapshot | null;
  /** Set when commit mode was used and a one-time claim was actually granted. */
  claim: DiscountClaim | null;
  /** True when first-time was eligible but lost the atomic race. */
  firstTimeDenied: boolean;
}

export async function priceProductForStudent(
  input: PriceForStudentInput,
): Promise<PriceForStudentResult> {
  const now = input.now ?? new Date().toISOString();

  const [rules, affiliations, isFirstTimeCandidate] = await Promise.all([
    loadActiveRules(),
    loadStudentAffiliations(input.studentId),
    input.skipFirstTimeCheck
      ? Promise.resolve(false)
      : computeIsFirstTimePurchase(input.studentId),
  ]);

  let result = applyPricing({
    product: input.product,
    now,
    rules,
    studentAffiliations: affiliations,
    isFirstTimePurchase: isFirstTimeCandidate,
  });

  let claim: DiscountClaim | null = null;
  let firstTimeDenied = false;

  // Commit mode: if a first-time-purchase rule was actually applied,
  // we MUST atomically claim eligibility now. The unique constraint in
  // discount_claims (or the synchronous in-memory tryCreate) is the
  // authoritative gate against concurrent flows both succeeding.
  if (input.commit) {
    const firstTimeApplied = result.appliedDiscounts.find(
      (d) => d.ruleType === "first_time_purchase",
    );
    if (firstTimeApplied) {
      const attempt = await getDiscountClaimRepo().tryCreate({
        studentId: input.studentId,
        claimType: "first_time_purchase",
        ruleId: firstTimeApplied.ruleId,
        source: input.commit.source,
        relatedSessionId: input.commit.relatedSessionId ?? null,
        relatedSubscriptionId: input.commit.relatedSubscriptionId ?? null,
      });

      if (attempt.granted && attempt.claim) {
        claim = attempt.claim;
      } else {
        firstTimeDenied = true;
        // Re-run the engine WITHOUT first-time eligibility so the caller
        // gets a result that matches what was actually awarded. Other
        // discounts (e.g. affiliation) can still apply.
        result = applyPricing({
          product: input.product,
          now,
          rules,
          studentAffiliations: affiliations,
          isFirstTimePurchase: false,
        });

        try {
          logFinanceEvent({
            entityType: "subscription",
            entityId: `student:${input.studentId}`,
            action: "manual_edit",
            detail:
              "First-time discount denied: another active claim already exists.",
            metadata: {
              anomaly: "first_time_claim_denied",
              source: input.commit.source,
              existingClaimId: attempt.existingClaim?.id ?? null,
              existingClaimSource: attempt.existingClaim?.source ?? null,
            },
          });
        } catch (e) {
          console.warn(
            "[pricing-service] failed to log first-time denial:",
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
  }

  const snapshot: AppliedDiscountSnapshot | null =
    result.appliedDiscounts.length > 0
      ? {
          appliedAt: now,
          basePriceCents: result.basePriceCents,
          totalDiscountCents: result.totalDiscountCents,
          finalPriceCents: result.finalPriceCents,
          appliedDiscounts: result.appliedDiscounts.map((a) => ({ ...a })),
        }
      : null;

  return { ...result, snapshot, claim, firstTimeDenied };
}

/**
 * Release a previously-granted claim. Used when a discounted purchase
 * flow CRASHES after the claim was recorded (e.g. Stripe session
 * creation throws, or subscription insert fails). Refunds DO NOT call
 * this — refunded purchases consumed the benefit.
 */
export async function releaseDiscountClaim(
  claimId: string,
  reason: string,
): Promise<void> {
  try {
    await getDiscountClaimRepo().release(claimId, reason);
  } catch (e) {
    console.warn(
      `[pricing-service] failed to release claim ${claimId}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Patch a previously-granted claim with the resulting subscription /
 * Stripe session id, for audit traceability. Best-effort.
 */
export async function attachClaimRelations(
  claimId: string,
  patch: { relatedSubscriptionId?: string | null; relatedSessionId?: string | null },
): Promise<void> {
  try {
    await getDiscountClaimRepo().setRelated(claimId, patch);
  } catch (e) {
    console.warn(
      `[pricing-service] failed to attach claim relations ${claimId}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Batch helper for display surfaces (catalog, dashboard preview, etc.).
 *
 * Loads rules + affiliations + first-time-flag ONCE for the student and
 * runs the pure engine for each product. Intended for read-only previews
 * where no atomic claim is required — the result returned here MUST NOT
 * be persisted as a frozen snapshot. For commit paths use
 * priceProductForStudent({ commit: ... }) per product.
 *
 * Returns a Map keyed by product.id.
 */
export async function previewPricingForStudent(input: {
  studentId: string;
  products: PricingProduct[];
  now?: string;
}): Promise<Map<string, PricingResult>> {
  const now = input.now ?? new Date().toISOString();
  const [rules, affiliations, isFirstTime] = await Promise.all([
    loadActiveRules(),
    loadStudentAffiliations(input.studentId),
    computeIsFirstTimePurchase(input.studentId),
  ]);

  const out = new Map<string, PricingResult>();
  for (const product of input.products) {
    const result = applyPricing({
      product,
      now,
      rules,
      studentAffiliations: affiliations,
      isFirstTimePurchase: isFirstTime,
    });
    out.set(product.id, result);
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────

async function loadActiveRules(): Promise<DiscountRule[]> {
  const rules = await getDiscountRuleRepo().getActive();
  return rules.map(toEngineRule);
}

async function loadStudentAffiliations(
  studentId: string,
): Promise<StudentAffiliation[]> {
  const rows = await getAffiliationRepo().getByStudent(studentId);
  return rows.map(toEngineAffiliation);
}

/**
 * "First time" = the student has not yet consumed a first-time-purchase
 * discount, AND has zero prior subscriptions with paymentStatus "paid"
 * or "pending".
 *
 * The authoritative source post-hardening is the discount_claims table:
 * if any active claim exists for this student, they are not first-time.
 * The legacy fallback (subscription scan) is retained so historical
 * subscriptions that pre-date the claims table still block correctly
 * without requiring a backfill migration.
 */
async function computeIsFirstTimePurchase(studentId: string): Promise<boolean> {
  // Authoritative gate: an active claim means first-time was already
  // consumed. This is the same row that tryCreate would conflict on.
  const active = await getDiscountClaimRepo().findActive(
    studentId,
    "first_time_purchase",
  );
  if (active) return false;

  // Legacy / defense-in-depth: inspect prior subscription rows.
  const all = await getSubscriptionRepo().getByStudent(studentId);
  for (const s of all) {
    if (s.paymentStatus === "paid" || s.paymentStatus === "pending") {
      return false;
    }
    const snap = s.appliedDiscount as AppliedDiscountSnapshot | null;
    if (snap?.appliedDiscounts?.some((d) => d.ruleType === "first_time_purchase")) {
      return false;
    }
  }
  return true;
}

// ── Stripe metadata transit for frozen pricing ───────────────

/**
 * Compact serialization for stuffing into a Stripe Checkout Session
 * metadata value. Stripe limits each metadata value to ~500 chars, so
 * we drop verbose fields (name, reason, description) which are
 * rehydrated at fulfillment via a rule lookup.
 */
interface CompactDiscountTransit {
  r: string; // ruleId
  c: string; // code
  t: AppliedDiscount["ruleType"];
  k: AppliedDiscount["discountKind"];
  v: number; // discountValue
  a: number; // amountCents
  af: AppliedDiscount["affiliationType"] | null;
  ai: string | null;
}

interface CompactPricingTransit {
  v: 1;
  at: string;
  b: number;
  d: number;
  f: number;
  ds: CompactDiscountTransit[];
}

export function serializePricingForStripe(
  pricing: PriceForStudentResult,
): string | null {
  if (!pricing.snapshot) return null;
  const payload: CompactPricingTransit = {
    v: 1,
    at: pricing.snapshot.appliedAt,
    b: pricing.basePriceCents,
    d: pricing.totalDiscountCents,
    f: pricing.finalPriceCents,
    ds: pricing.appliedDiscounts.map((a) => ({
      r: a.ruleId,
      c: a.code,
      t: a.ruleType,
      k: a.discountKind,
      v: a.discountValue,
      a: a.amountCents,
      af: a.affiliationType,
      ai: a.affiliationId,
    })),
  };
  return JSON.stringify(payload);
}

/**
 * Frozen pricing object passed to subscription-creation code paths to
 * bypass the engine entirely (used by Stripe webhook fulfillment).
 */
export interface FrozenPricing {
  basePriceCents: number;
  totalDiscountCents: number;
  finalPriceCents: number;
  appliedDiscounts: AppliedDiscount[];
  snapshot: AppliedDiscountSnapshot | null;
}

/**
 * Deserialize the compact Stripe transit form back into a FrozenPricing
 * object. Rehydrates `name` and `reason` by looking up the rule by id;
 * if the rule has been deleted in the interim, falls back to `code` /
 * empty reason — the structural decision (id, type, amount) is what
 * matters for the immutable record.
 */
export async function deserializePricingFromStripe(
  raw: string,
): Promise<FrozenPricing | null> {
  let parsed: CompactPricingTransit;
  try {
    parsed = JSON.parse(raw) as CompactPricingTransit;
  } catch {
    return null;
  }
  if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.ds)) return null;

  // Rehydrate display fields by looking up the original rules.
  const rules = await getDiscountRuleRepo().getAll();
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const applied: AppliedDiscount[] = parsed.ds.map((d) => {
    const rule = ruleById.get(d.r);
    return {
      ruleId: d.r,
      code: d.c,
      name: rule?.name ?? d.c,
      ruleType: d.t,
      discountKind: d.k,
      discountValue: d.v,
      amountCents: d.a,
      affiliationType: d.af,
      affiliationId: d.ai,
      reason: rule?.description ?? "",
    };
  });

  const snapshot: AppliedDiscountSnapshot | null =
    applied.length > 0
      ? {
          appliedAt: parsed.at,
          basePriceCents: parsed.b,
          totalDiscountCents: parsed.d,
          finalPriceCents: parsed.f,
          appliedDiscounts: applied.map((a) => ({ ...a })),
        }
      : null;

  return {
    basePriceCents: parsed.b,
    totalDiscountCents: parsed.d,
    finalPriceCents: parsed.f,
    appliedDiscounts: applied,
    snapshot,
  };
}

/**
 * Detect a first-time-discount race: does this student already have a
 * paid/pending subscription whose frozen snapshot used the same
 * first_time_purchase rule? If yes, the discount was double-applied
 * (typically due to two concurrent checkout sessions clearing the
 * "first paid sub" guard at the same time) and admin should review.
 */
export async function detectFirstTimeRaceConflict(params: {
  studentId: string;
  excludeSubscriptionId: string;
  appliedDiscount: AppliedDiscountSnapshot | null;
}): Promise<{ conflicted: boolean; conflictingSubscriptionIds: string[] }> {
  const { studentId, excludeSubscriptionId, appliedDiscount } = params;
  if (!appliedDiscount) return { conflicted: false, conflictingSubscriptionIds: [] };
  const usedFirstTime = appliedDiscount.appliedDiscounts.some(
    (d) => d.ruleType === "first_time_purchase",
  );
  if (!usedFirstTime) return { conflicted: false, conflictingSubscriptionIds: [] };

  const all = await getSubscriptionRepo().getByStudent(studentId);
  const conflicts = all.filter((s) => {
    if (s.id === excludeSubscriptionId) return false;
    if (s.paymentStatus !== "paid" && s.paymentStatus !== "pending") return false;
    const snap = s.appliedDiscount as AppliedDiscountSnapshot | null;
    return Boolean(
      snap?.appliedDiscounts?.some((d) => d.ruleType === "first_time_purchase"),
    );
  });

  return {
    conflicted: conflicts.length > 0,
    conflictingSubscriptionIds: conflicts.map((c) => c.id),
  };
}

function toEngineRule(r: MockDiscountRule): DiscountRule {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    ruleType: r.ruleType,
    affiliationType: r.affiliationType,
    discountKind: r.discountKind,
    discountValue: r.discountValue,
    appliesToProductTypes: r.appliesToProductTypes,
    appliesToProductIds: r.appliesToProductIds,
    minPriceCents: r.minPriceCents,
    maxDiscountCents: r.maxDiscountCents,
    isActive: r.isActive,
    priority: r.priority,
    stackable: r.stackable,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toEngineAffiliation(a: MockStudentAffiliation): StudentAffiliation {
  return {
    id: a.id,
    studentId: a.studentId,
    affiliationType: a.affiliationType,
    verificationStatus: a.verificationStatus,
    verifiedAt: a.verifiedAt,
    verifiedBy: a.verifiedBy,
    metadata: a.metadata,
    validFrom: a.validFrom,
    validUntil: a.validUntil,
    notes: a.notes,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/**
 * Build a finance-audit metadata payload from a pricing result. Accepts
 * both live PricingResult and FrozenPricing (Stripe webhook path) since
 * the audit-relevant fields are a subset shared by both.
 *
 * Returns null when no discounts were applied so the audit log stays clean.
 */
export function buildAuditDiscountMetadata(
  result: Pick<PricingResult, "basePriceCents" | "totalDiscountCents" | "finalPriceCents" | "appliedDiscounts">,
): Record<string, unknown> | null {
  if (result.appliedDiscounts.length === 0) return null;
  return {
    basePriceCents: result.basePriceCents,
    totalDiscountCents: result.totalDiscountCents,
    finalPriceCents: result.finalPriceCents,
    appliedDiscounts: result.appliedDiscounts.map(
      (a: AppliedDiscount) => ({ ...a }),
    ),
  };
}
