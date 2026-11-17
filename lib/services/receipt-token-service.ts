/**
 * Guest event Payment Receipt links (Phase 23).
 *
 * Contract:
 *   * Only GUEST event purchases get a public receipt credential. Logged-in
 *     students reach their receipts through authenticated ownership routes.
 *   * Issuing revokes any active token for the purchase and stores only the
 *     SHA-256 of a new 32-byte random token. The raw token is returned once,
 *     for building the email link, and is never stored or logged.
 *   * The link may only be emailed to the guest email frozen on the
 *     purchase; `recipientEmail` is returned so callers never take one
 *     from staff input.
 *   * Resolving requires an exact hash match, an unrevoked and unexpired
 *     token, and a purchase that is still a receipt-eligible guest purchase.
 *     Every failure looks the same to the caller.
 *
 * Not a server action: callers that issue on behalf of staff must already
 * have enforced `payments:send_receipt`.
 */

import "server-only";
import { getReceiptTokenRepo, getSpecialEventRepo } from "@/lib/repositories";
import { evaluateReceiptEligibility, type ReceiptIneligibleReason } from "@/lib/domain/receipts";
import {
  generateReceiptToken,
  hashReceiptToken,
  isReceiptTokenUsable,
  isWellFormedReceiptToken,
  type ReceiptTokenIssueReason,
} from "@/lib/domain/receipt-token";
import type { MockEventPurchase } from "@/lib/mock-data";

type IssueRefusal = {
  ok: false;
  error: "purchase_not_found" | "not_guest_purchase" | "no_guest_email" | "not_receipt_eligible";
  reason?: ReceiptIneligibleReason;
};

export type IssueGuestReceiptTokenResult =
  | {
      ok: true;
      rawToken: string;
      tokenId: string;
      recipientEmail: string;
      purchase: MockEventPurchase;
      /** The token this issue revoked, if any (rotation only). */
      previousTokenId: string | null;
    }
  | IssueRefusal;

export type IssueInitialGuestReceiptTokenResult =
  | Extract<IssueGuestReceiptTokenResult, { ok: true }>
  | IssueRefusal
  /** An active token already exists; nothing was issued or revoked. */
  | { ok: false; error: "already_issued" };

function isGuestPurchase(p: MockEventPurchase): boolean {
  return p.studentId == null;
}

async function loadIssuablePurchase(
  eventPurchaseId: string,
): Promise<{ ok: true; purchase: MockEventPurchase; recipientEmail: string } | IssueRefusal> {
  const purchase = await getSpecialEventRepo().getPurchaseById(eventPurchaseId);
  if (!purchase) return { ok: false, error: "purchase_not_found" };
  if (!isGuestPurchase(purchase)) return { ok: false, error: "not_guest_purchase" };

  const recipientEmail = purchase.guestEmail?.trim();
  if (!recipientEmail) return { ok: false, error: "no_guest_email" };

  const eligibility = evaluateReceiptEligibility({ kind: "event_purchase", row: purchase });
  if (!eligibility.eligible) return { ok: false, error: "not_receipt_eligible", reason: eligibility.reason };
  return { ok: true, purchase, recipientEmail };
}

/** Staff send/resend: revokes the active token (if any) and issues a new one. */
export async function issueGuestEventReceiptToken(input: {
  eventPurchaseId: string;
  reason: ReceiptTokenIssueReason;
  /** Staff user id for `admin_send`; null for the automatic purchase email. */
  createdBy: string | null;
  expiresAt?: string | null;
}): Promise<IssueGuestReceiptTokenResult> {
  const loaded = await loadIssuablePurchase(input.eventPurchaseId);
  if (!loaded.ok) return loaded;

  const repo = getReceiptTokenRepo();
  const previous = await repo.findActiveForEventPurchase(loaded.purchase.id);
  const { rawToken, tokenHash } = generateReceiptToken();
  const record = await repo.rotateForEventPurchase({
    eventPurchaseId: loaded.purchase.id,
    tokenHash,
    issuedReason: input.reason,
    createdBy: input.createdBy,
    expiresAt: input.expiresAt ?? null,
  });
  return {
    ok: true,
    rawToken,
    tokenId: record.id,
    recipientEmail: loaded.recipientEmail,
    purchase: loaded.purchase,
    previousTokenId: previous && previous.id !== record.id ? previous.id : null,
  };
}

/**
 * The automatic purchase email's link. Issued only when the purchase has
 * no active token, and never revokes one, so a repeated or concurrent
 * call can neither break a link already emailed nor produce a second.
 */
export async function issueInitialGuestEventReceiptToken(
  eventPurchaseId: string,
): Promise<IssueInitialGuestReceiptTokenResult> {
  const loaded = await loadIssuablePurchase(eventPurchaseId);
  if (!loaded.ok) return loaded;

  const { rawToken, tokenHash } = generateReceiptToken();
  const record = await getReceiptTokenRepo().insertIfNoActive({
    eventPurchaseId: loaded.purchase.id,
    tokenHash,
    issuedReason: "purchase_email",
    createdBy: null,
    expiresAt: null,
  });
  if (!record) return { ok: false, error: "already_issued" };
  return {
    ok: true,
    rawToken,
    tokenId: record.id,
    recipientEmail: loaded.recipientEmail,
    purchase: loaded.purchase,
    previousTokenId: null,
  };
}

/**
 * Undo a staff resend whose email was not delivered: revoke the new token
 * and restore the one it replaced, so the customer's existing link keeps
 * working. Best effort; returns whether the previous link is active again.
 */
export async function rollBackGuestReceiptTokenRotation(input: {
  newTokenId: string;
  previousTokenId: string | null;
}): Promise<boolean> {
  const repo = getReceiptTokenRepo();
  await repo.revokeById(input.newTokenId, new Date().toISOString());
  if (!input.previousTokenId) return false;
  return repo.reinstate(input.previousTokenId);
}

export type ResolveGuestReceiptTokenResult =
  | { ok: true; eventPurchaseId: string; tokenId: string; purchase: MockEventPurchase }
  | { ok: false };

export async function resolveGuestEventReceiptToken(
  rawToken: unknown,
  now: Date = new Date(),
): Promise<ResolveGuestReceiptTokenResult> {
  if (!isWellFormedReceiptToken(rawToken)) return { ok: false };

  const repo = getReceiptTokenRepo();
  const record = await repo.findByHash(hashReceiptToken(rawToken));
  if (!record || !isReceiptTokenUsable(record, now)) return { ok: false };

  const purchase = await getSpecialEventRepo().getPurchaseById(record.eventPurchaseId);
  if (!purchase || !isGuestPurchase(purchase)) return { ok: false };
  if (!evaluateReceiptEligibility({ kind: "event_purchase", row: purchase }).eligible) return { ok: false };

  try {
    await repo.touchLastUsed(record.id, now.toISOString());
  } catch {
    // Usage tracking must never block a valid receipt.
  }
  return { ok: true, eventPurchaseId: purchase.id, tokenId: record.id, purchase };
}

export async function revokeGuestEventReceiptTokens(eventPurchaseId: string): Promise<number> {
  return getReceiptTokenRepo().revokeAllForEventPurchase(eventPurchaseId);
}
