/**
 * In-memory store for atomic discount claims (Phase 4 hardening).
 *
 * The store enforces a single rule: at most one ACTIVE claim per
 * (studentId, claimType) tuple. The atomic primitive is `tryCreate` —
 * it performs the existence check + insert in a single synchronous
 * step, which is atomic in the Node.js single-threaded event loop.
 *
 * In supabase mode the store is empty; the supabase repo enforces the
 * same invariant via a partial unique index (see migration 00057).
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
 * Atomic claim attempt. Synchronous from check → insert; no awaits in
 * between, so the Node event loop guarantees no two parallel callers
 * can both succeed.
 */
export function tryCreate(
  input: CreateClaimInput,
): {
  granted: boolean;
  claim: DiscountClaim | null;
  existingClaim: DiscountClaim | null;
} {
  const list = store();
  const existing = list.find(
    (c) =>
      c.studentId === input.studentId &&
      c.claimType === input.claimType &&
      c.releasedAt === null,
  );
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
