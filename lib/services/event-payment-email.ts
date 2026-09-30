import "server-only";

/**
 * Event purchase email helpers shared by the event email actions and the
 * trusted payment paths. Not a Server Action module:
 * `sendPaymentConfirmationEmail` takes arbitrary purchase ids and must only
 * run after a server-side payment confirmation (Stripe fulfilment or a
 * permission-gated reception action).
 */

import { getSpecialEventRepo } from "@/lib/repositories";
import { sendEventPurchaseEmail, type EventPurchaseEmailData, type EmailSendResult } from "@/lib/communications/event-emails";
import type { MockEventPurchase, MockEventProduct, MockSpecialEvent } from "@/lib/mock-data";

// ── Helpers ──────────────────────────────────────────────────

function centsToEuros(c: number): string {
  return `€${(c / 100).toFixed(2)}`;
}

function buildInclusionSummary(inclusionRule: string): string {
  switch (inclusionRule) {
    case "all_sessions": return "All event sessions";
    case "all_workshops": return "All workshops";
    case "socials_only": return "Social sessions only";
    case "selected_sessions": return "Selected sessions (see event page for details)";
    default: return "";
  }
}

export async function trackEmailSend(purchaseId: string, emailType: string, result: EmailSendResult) {
  try {
    await getSpecialEventRepo().updatePurchaseEmailTracking(purchaseId, {
      lastEmailType: emailType,
      lastEmailSentAt: new Date().toISOString(),
      lastEmailSuccess: result.sent,
    });
  } catch { /* non-critical */ }
}

export function buildEmailData(
  purchase: MockEventPurchase,
  product: MockEventProduct,
  event: MockSpecialEvent,
): EventPurchaseEmailData {
  const isGuest = !purchase.studentId;
  return {
    studentId: purchase.studentId,
    studentName: isGuest ? (purchase.guestName ?? "Guest") : "Student",
    directEmail: isGuest ? (purchase.guestEmail ?? undefined) : undefined,
    eventTitle: event.title,
    eventId: event.id,
    productName: purchase.productNameSnapshot ?? product.name,
    productType: purchase.productTypeSnapshot ?? product.productType,
    priceLabel: purchase.originalAmountCents != null
      ? centsToEuros(purchase.originalAmountCents)
      : centsToEuros(product.priceCents),
    paymentStatus: purchase.paymentStatus === "paid" ? "paid" : "pending",
    inclusionSummary: buildInclusionSummary(product.inclusionRule),
    qrToken: (isGuest && purchase.paymentStatus === "paid" && purchase.qrToken) ? purchase.qrToken : undefined,
    coverImageUrl: event.coverImageUrl ?? undefined,
  };
}

// ══════════════════════════════════════════════════════════════
// SEND EMAIL AFTER RECEPTION PAYMENT
// ══════════════════════════════════════════════════════════════

export async function sendPaymentConfirmationEmail(
  purchaseId: string,
  eventId: string,
  qrToken?: string,
): Promise<void> {
  const tag = `[payment-confirm-email purchase=${purchaseId}]`;
  const repo = getSpecialEventRepo();
  try {
    const [event, purchases, products] = await Promise.all([
      repo.getEventById(eventId),
      repo.getPurchasesByEvent(eventId),
      repo.getProductsByEvent(eventId),
    ]);
    const purchase = purchases.find((p) => p.id === purchaseId);
    if (!purchase || !event) { console.warn(`${tag} Purchase or event not found — skipping`); return; }
    const product = products.find((p) => p.id === purchase.eventProductId);
    if (!product) { console.warn(`${tag} Product not found — skipping`); return; }

    const data = buildEmailData(purchase, product, event);
    if (qrToken) data.qrToken = qrToken;
    data.paymentStatus = "paid";

    console.info(`${tag} Sending payment confirmation email…`);
    const result = await sendEventPurchaseEmail(data);
    console.info(`${tag} Result: sent=${result.sent}`);
    await trackEmailSend(purchaseId, "payment_confirmation", result);
  } catch (err) {
    console.error(`${tag} Threw:`, err instanceof Error ? err.message : err);
  }
}
