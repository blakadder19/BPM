import type { ReceiptTokenIssueReason, ReceiptTokenRecord } from "@/lib/domain/receipt-token";

export interface RotateReceiptTokenInput {
  eventPurchaseId: string;
  tokenHash: string;
  issuedReason: ReceiptTokenIssueReason;
  createdBy: string | null;
  expiresAt: string | null;
}

export interface IReceiptTokenRepository {
  /**
   * Revoke every active token for the purchase and store the new hash,
   * atomically. At most one active token per purchase exists afterwards.
   */
  rotateForEventPurchase(input: RotateReceiptTokenInput): Promise<ReceiptTokenRecord>;
  /**
   * Store the hash only if the purchase has no active token; never revokes.
   * Returns null when an active token already exists (the partial unique
   * index on active tokens decides, so concurrent callers cannot both win).
   */
  insertIfNoActive(input: RotateReceiptTokenInput): Promise<ReceiptTokenRecord | null>;
  /** Exact match on the stored hash. Returns revoked/expired rows too; the caller decides. */
  findByHash(tokenHash: string): Promise<ReceiptTokenRecord | null>;
  findActiveForEventPurchase(eventPurchaseId: string): Promise<ReceiptTokenRecord | null>;
  /** Which of the given purchases currently have an active token. */
  listPurchasesWithActiveToken(eventPurchaseIds: readonly string[]): Promise<Set<string>>;
  /** Revoke one token if it is still active. */
  revokeById(id: string, atIso: string): Promise<void>;
  /**
   * Un-revoke a token. Only used to restore the previous link when a
   * resend email fails. Returns false if it could not be restored (for
   * example because another active token now exists).
   */
  reinstate(id: string): Promise<boolean>;
  /** Revoke all active tokens for the purchase. Returns how many were revoked. */
  revokeAllForEventPurchase(eventPurchaseId: string): Promise<number>;
  touchLastUsed(id: string, atIso: string): Promise<void>;
}
