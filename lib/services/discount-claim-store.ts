/**
 * In-memory store for atomic discount claims (Phase 4 hardening).
 *
 * The store enforces a single rule: at most one ACTIVE claim per
 * (studentId, claimType, ruleId) tuple. The atomic primitive is
 * `tryCreate` — it performs the existence check + insert in a single
 * synchronous step, which is atomic in the Node.js single-threaded
 * event loop.
 *
 * Historical note: pre-00064 the uniqueness was (studentId, claimType)
 * — i.e. one global first-time slot per student. That coarse grain
 * caused Yoga purchases to consume the Beginners-only first-time
 * discount. Now each first-time rule gets its own slot keyed by
 * `ruleId`, so scoped rules coexist independently.
 *
 * In supabase mode the store is empty; the supabase repo enforces the
 * same invariant via a partial unique index (see migrations 00057 /
 * 00064).
 */

import { generateId } from "@/lib/utils";

export type ClaimType = "first_time_purchase";

export type ClaimSource =
  | "catalog_purchase"
  | "stripe_checkout"
  | "admin_manual"
  | "qr_dropin";

export interface DiscountClaim {
  id: string;
  studentId: string;
  claimType: ClaimType;
  ruleId: string | null;
  source: ClaimSource;
  relatedSubscriptionId: string | null;
  relatedSessionId: string | null;
  releasedAt: string | null;
  releasedReason: string | null;
  claimedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClaimInput {
  id?: string;
  studentId: string;
  claimType: ClaimType;
  ruleId: string | null;
  source: ClaimSource;
  relatedSubscriptionId?: string | null;
  relatedSessionId?: string | null;
}

const g = globalThis as unknown as { __bpm_discount_claims?: DiscountClaim[] };

function store(): DiscountClaim[] {
  if (!g.__bpm_discount_claims) g.__bpm_discount_claims = [];
  return g.__bpm_discount_claims;
}

export function findActive(
  studentId: string,
  claimType: ClaimType,
): DiscountClaim | null {
  return (
    store().find(
      (c) =>
        c.studentId === studentId &&
        c.claimType === claimType &&
        c.releasedAt === null,
    ) ?? null
  );
}

/**
 * Authoritative per-rule lookup. Mirrors the DB partial unique index
 * `(student_id, rule_id) WHERE released_at IS NULL`.
 */
export function findActiveForRule(
  studentId: string,
  ruleId: string,
): DiscountClaim | null {
  return (
    store().find(
      (c) =>
        c.studentId === studentId &&
        c.ruleId === ruleId &&
        c.releasedAt === null,
    ) ?? null
  );
}

/**
 * Returns every active claim of the given `claimType` for a student.
 * Useful for surfaces that want to display the full "what has this
 * student already consumed" picture across all rules, and for the
 * pricing service to compute per-rule first-time eligibility in one
 * shot (instead of N round-trips).
 */
export function getActiveByStudent(
  studentId: string,
  claimType: ClaimType,
): DiscountClaim[] {
  return store().filter(
    (c) =>
      c.studentId === studentId &&
      c.claimType === claimType &&
      c.releasedAt === null,
  );
}

/**
 * Atomic claim attempt. Synchronous from check → insert; no awaits in
 * between, so the Node event loop guarantees no two parallel callers
 * can both succeed.
 *
 * Uniqueness contract — mirrors the DB partial unique index
 *   `(student_id, rule_id) WHERE released_at IS NULL AND rule_id IS NOT NULL`
 * exactly so memory mode and supabase mode never diverge:
 *
 *   * Scoped attempt (`ruleId !== null`) conflicts ONLY with another
 *     active row that has the SAME `(studentId, ruleId)`. Legacy
 *     null-ruleId rows sit outside the unique index and do NOT block.
 *     The scope-aware subscription-history scan in
 *     `pricing-service.computeFirstTimeEligibilityByRule` is the
 *     authoritative legacy-defense layer.
 *   * Legacy-style attempt (`ruleId === null`) conflicts with another
 *     active null-ruleId row of the same `claimType` (admin / repair
 *     paths cannot accidentally double-mint a legacy block).
 */
export function tryCreate(
  input: CreateClaimInput,
): {
  granted: boolean;
  claim: DiscountClaim | null;
  existingClaim: DiscountClaim | null;
} {
  const list = store();
  const existing = list.find((c) => {
    if (c.releasedAt !== null) return false;
    if (c.studentId !== input.studentId) return false;
    if (c.claimType !== input.claimType) return false;
    if (input.ruleId !== null) {
      // Scoped path: only conflicts with same rule_id. Null rows are
      // intentionally ignored (DB partial unique index excludes them).
      return c.ruleId === input.ruleId;
    }
    // Legacy path: only conflicts with other null-ruleId rows.
    return c.ruleId === null;
  });
  if (existing) {
    return { granted: false, claim: null, existingClaim: existing };
  }
  const now = new Date().toISOString();
  const claim: DiscountClaim = {
    id: input.id ?? generateId("dcl"),
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
  list.push(claim);
  return { granted: true, claim, existingClaim: null };
}

export function release(id: string, reason: string): boolean {
  const c = store().find((x) => x.id === id);
  if (!c || c.releasedAt) return false;
  c.releasedAt = new Date().toISOString();
  c.releasedReason = reason;
  c.updatedAt = c.releasedAt;
  return true;
}

export function setRelated(
  id: string,
  patch: { relatedSubscriptionId?: string | null; relatedSessionId?: string | null },
): boolean {
  const c = store().find((x) => x.id === id);
  if (!c) return false;
  if (patch.relatedSubscriptionId !== undefined) {
    c.relatedSubscriptionId = patch.relatedSubscriptionId;
  }
  if (patch.relatedSessionId !== undefined) {
    c.relatedSessionId = patch.relatedSessionId;
  }
  c.updatedAt = new Date().toISOString();
  return true;
}

export function getById(id: string): DiscountClaim | null {
  return store().find((c) => c.id === id) ?? null;
}

/** Test/dev helper — clears the in-memory claim store. Not used in prod. */
export function _resetForTests(): void {
  g.__bpm_discount_claims = [];
}
