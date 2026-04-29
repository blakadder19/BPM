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
  /** Atomic create. Returns granted=false if (studentId,claimType) already has an active claim. */
  tryCreate(input: CreateClaimInput): Promise<ClaimAttemptResult>;
  release(id: string, reason: string): Promise<boolean>;
  setRelated(
    id: string,
    patch: { relatedSubscriptionId?: string | null; relatedSessionId?: string | null },
  ): Promise<boolean>;
  getById(id: string): Promise<DiscountClaim | null>;
}
