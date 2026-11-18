import "server-only";

/**
 * Delivery of guest Payment Receipt links (Phase 23).
 *
 * Only the SHA-256 of a link's token is stored, so a link can never be
 * rebuilt and "sent again": every staff send issues a new token. That is
 * why the two flows differ:
 *
 *   * Purchase confirmation (automatic). Runs only in the call that
 *     created the purchase or marked it paid; Stripe webhook replays and
 *     the success-page reconcile return before reaching it because the
 *     purchase already exists. The token is claimed with insert-if-none,
 *     so even a second caller for the same purchase gets no link and
 *     revokes nothing.
 *   * Staff send / resend. Rotates: the old link is revoked and a new one
 *     issued, then emailed. If the email is not accepted the rotation is
 *     rolled back — the new token is revoked and the old one restored —
 *     so a failed send never breaks a link the customer already has.
 *
 * Raw tokens and receipt URLs are never logged or audited.
 */

import { getAppUrl } from "@/lib/utils/app-url";
import { formatReceiptMoney } from "@/lib/domain/receipt-format";
import {
  issueGuestEventReceiptToken,
  issueInitialGuestEventReceiptToken,
  rollBackGuestReceiptTokenRotation,
} from "@/lib/services/receipt-token-service";
import { sendGuestReceiptEmail, type EmailSendResult } from "@/lib/communications/event-emails";
import type { MockEventPurchase } from "@/lib/mock-data";

/**
 * The token goes in the fragment, which browsers never send to the server,
 * so request logs only see `/receipt` (see guest-receipt-route.ts).
 */
export function guestReceiptUrl(rawToken: string): string {
  return `${getAppUrl()}/receipt#${rawToken}`;
}

/** Amount actually paid, from the frozen purchase fields only. */
export function frozenPaidAmountLabel(purchase: Pick<MockEventPurchase, "paidAmountCents" | "currency">): string {
  return formatReceiptMoney(purchase.paidAmountCents ?? 0, (purchase.currency ?? "eur").toUpperCase());
}

/**
 * Link for the automatic confirmation email, or null when the purchase
 * gets none (not a guest, not receipt-eligible, or a link was already
 * issued). Never throws: a receipt problem must not block the ticket email.
 */
export async function claimInitialGuestReceiptUrl(eventPurchaseId: string): Promise<string | null> {
  try {
    const issued = await issueInitialGuestEventReceiptToken(eventPurchaseId);
    if (!issued.ok) {
      console.info(`[guest-receipt] purchase=${eventPurchaseId} no receipt link in confirmation (${issued.error}).`);
      return null;
    }
    console.info(`[guest-receipt] purchase=${eventPurchaseId} receipt link issued token=${issued.tokenId}.`);
    return guestReceiptUrl(issued.rawToken);
  } catch (err) {
    console.error(
      `[guest-receipt] purchase=${eventPurchaseId} could not issue receipt link:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export type StaffGuestReceiptSendResult =
  | {
      ok: true;
      eventId: string;
      recipientEmail: string;
      tokenId: string;
      /** A previously issued link was revoked by this send. */
      replacedPreviousLink: boolean;
    }
  | {
      ok: false;
      error: string;
      code: "not_found" | "not_guest" | "no_email" | "not_eligible" | "send_failed" | "issue_failed";
      /** For send failures: whether the customer's previous link still works. */
      previousLinkActive?: boolean;
    };

export async function sendStaffGuestReceipt(input: {
  eventPurchaseId: string;
  staffUserId: string;
}): Promise<StaffGuestReceiptSendResult> {
  let issued: Awaited<ReturnType<typeof issueGuestEventReceiptToken>>;
  try {
    issued = await issueGuestEventReceiptToken({
      eventPurchaseId: input.eventPurchaseId,
      reason: "admin_send",
      createdBy: input.staffUserId,
    });
  } catch (err) {
    console.error(
      `[guest-receipt] purchase=${input.eventPurchaseId} staff issue failed:`,
      err instanceof Error ? err.message : err,
    );
    return { ok: false, code: "issue_failed", error: "The receipt link could not be created. Nothing was sent." };
  }

  if (!issued.ok) {
    switch (issued.error) {
      case "purchase_not_found":
        return { ok: false, code: "not_found", error: "Purchase not found." };
      case "not_guest_purchase":
        return { ok: false, code: "not_guest", error: "Students see their receipts on their Payments page." };
      case "no_guest_email":
        return { ok: false, code: "no_email", error: "This purchase has no guest email on record." };
      case "not_receipt_eligible":
        return { ok: false, code: "not_eligible", error: "This purchase has no payment receipt (unpaid, free or incomplete)." };
      default: {
        const unreachable: never = issued.error;
        return { ok: false, code: "issue_failed", error: `Unexpected result: ${String(unreachable)}` };
      }
    }
  }

  const { purchase } = issued;
  let sendResult: EmailSendResult;
  try {
    sendResult = await sendGuestReceiptEmail({
      to: issued.recipientEmail,
      recipientName: purchase.guestName?.trim() || "there",
      eventTitle: purchase.eventTitleSnapshot ?? "Event",
      productName: purchase.productNameSnapshot ?? "Event ticket",
      amountLabel: frozenPaidAmountLabel(purchase),
      receiptUrl: guestReceiptUrl(issued.rawToken),
    });
  } catch (err) {
    sendResult = { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }

  if (sendResult.sent) {
    return {
      ok: true,
      eventId: purchase.eventId,
      recipientEmail: issued.recipientEmail,
      tokenId: issued.tokenId,
      replacedPreviousLink: issued.previousTokenId !== null,
    };
  }

  let previousLinkActive = false;
  try {
    previousLinkActive = await rollBackGuestReceiptTokenRotation({
      newTokenId: issued.tokenId,
      previousTokenId: issued.previousTokenId,
    });
  } catch (err) {
    console.error(
      `[guest-receipt] purchase=${input.eventPurchaseId} rollback after failed send failed:`,
      err instanceof Error ? err.message : err,
    );
  }
  console.warn(
    `[guest-receipt] purchase=${input.eventPurchaseId} staff send not delivered (${sendResult.reason}); previous link active=${previousLinkActive}.`,
  );
  return {
    ok: false,
    code: "send_failed",
    previousLinkActive,
    error: previousLinkActive
      ? "The email could not be sent. The customer's previous receipt link still works."
      : "The email could not be sent. No receipt link was delivered.",
  };
}
