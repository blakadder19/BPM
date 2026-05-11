import type {
  DiscountClaim,
  ClaimType,
  CreateClaimInput,
} from "@/lib/services/discount-claim-store";

export type { DiscountClaim, ClaimType, CreateClaimInput };

export interface ClaimAttemptResult {
  granted: boolean;
  claim: DiscountClaim | null;
  /** When granted=false, the row that already holds the claim. */
  existingClaim: DiscountClaim | null;
}

export interface IDiscountClaimRepository {
  findActive(studentId: string, claimType: ClaimType): Promise<DiscountClaim | null>;
  /**
   * Per-rule active-claim lookup. Mirrors the DB partial unique index
   * `(student_id, rule_id) WHERE released_at IS NULL` that the
   * post-migration claim system uses as the authoritative gate.
   */
  findActiveForRule(
    studentId: string,
    ruleId: string,
  ): Promise<DiscountClaim | null>;
  /**
   * All active claims of `claimType` for a student. The pricing
   * service uses this to compute per-rule first-time eligibility in
   * a single round-trip instead of N findActiveForRule calls. Order
   * is unspecified.
   */
  getActiveByStudent(
    studentId: string,
    claimType: ClaimType,
  ): Promise<DiscountClaim[]>;
  /**
   * Atomic create.
   *   * When `input.ruleId` is non-null (the post-migration path), the
   *     uniqueness key is `(studentId, ruleId)` — multiple first-time
   *     rules with disjoint scopes can each grant a claim.
   *   * When `input.ruleId` is null (legacy callers), falls back to the
   *     historical `(studentId, claimType)` uniqueness so behaviour
   *     does not silently change.
   */
  tryCreate(input: CreateClaimInput): Promise<ClaimAttemptResult>;
  release(id: string, reason: string): Promise<boolean>;
  setRelated(
    id: string,
    patch: { relatedSubscriptionId?: string | null; relatedSessionId?: string | null },
  ): Promise<boolean>;
  getById(id: string): Promise<DiscountClaim | null>;
}
