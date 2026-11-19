/**
 * Guest Payment Receipt credential (Phase 23).
 *
 * A guest event purchase has no account, so its receipt link carries an
 * opaque bearer token: 32 bytes from the CSPRNG, base64url-encoded. Only
 * its SHA-256 hash is stored (`receipt_access_tokens.token_hash`); the raw
 * token exists only in the emailed URL. A database leak therefore exposes
 * no usable link, and a link can be revoked without touching any other.
 *
 * Never use the guest QR token, Stripe session id, guest email or purchase
 * id as this credential — none is secret, random enough and scoped.
 */

import { createHash, randomBytes } from "node:crypto";

export const RECEIPT_TOKEN_BYTES = 32;

/** base64url of 32 bytes, unpadded: exactly 43 URL-safe characters. */
const RAW_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_HASH_RE = /^[0-9a-f]{64}$/;

export type ReceiptTokenIssueReason = "purchase_email" | "admin_send";

export interface ReceiptTokenRecord {
  id: string;
  eventPurchaseId: string;
  tokenHash: string;
  issuedReason: ReceiptTokenIssueReason;
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

export function hashReceiptToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** A fresh credential. The raw token must go only into the email link. */
export function generateReceiptToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(RECEIPT_TOKEN_BYTES).toString("base64url");
  return { rawToken, tokenHash: hashReceiptToken(rawToken) };
}

/** Cheap shape check so malformed input never reaches the database. */
export function isWellFormedReceiptToken(raw: unknown): raw is string {
  return typeof raw === "string" && RAW_TOKEN_RE.test(raw);
}

export function isWellFormedTokenHash(hash: string): boolean {
  return TOKEN_HASH_RE.test(hash);
}

/** Not revoked, and not past `expires_at` when one is set. */
export function isReceiptTokenUsable(record: Pick<ReceiptTokenRecord, "revokedAt" | "expiresAt">, now: Date): boolean {
  if (record.revokedAt) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}
