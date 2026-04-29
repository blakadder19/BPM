"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/staff-permissions";
import { getSpecialEventRepo } from "@/lib/repositories";
import { sendEventPurchaseEmail, type EventPurchaseEmailData, type EmailSendResult } from "@/lib/communications/event-emails";
import { isEmailEnabled, sendEmail } from "@/lib/communications/email-provider";
import { resolveStudentEmail } from "@/lib/communications/email-resolver";
import {
  bpmEmailWrap,
  bpmStatusBadge,
  bpmDetailsCard,
  bpmNotice,
  bpmCtaButton,
  bpmQrBlock,
} from "@/lib/communications/email-brand";
import { formatEventDateRange } from "@/lib/utils";
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

async function trackEmailSend(purchaseId: string, emailType: string, result: EmailSendResult) {
  try {
    await getSpecialEventRepo().updatePurchaseEmailTracking(purchaseId, {
      lastEmailType: emailType,
      lastEmailSentAt: new Date().toISOString(),
      lastEmailSuccess: result.sent,
    });
  } catch { /* non-critical */ }
}

function buildEmailData(
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
// RESEND PURCHASE EMAIL
// ══════════════════════════════════════════════════════════════

export interface ResendEmailResult {
  success: boolean;
  error?: string;
  sent?: boolean;
  trackingFailed?: boolean;
}

export async function resendEventPurchaseEmailAction(input: {
  purchaseId: string;
  eventId: string;
  /** Fallback email — pass the known buyer email from the UI so the action
   *  does not depend solely on resolveStudentEmail for internal students. */
  buyerEmail?: string;
}): Promise<ResendEmailResult> {
  const tag = `[resend-email purchase=${input.purchaseId}]`;
  try {
    await requirePermission("events:edit");

    const repo = getSpecialEventRepo();
    console.info(`${tag} Loading event=${input.eventId}…`);
    const [event, purchases, products] = await Promise.all([
      repo.getEventById(input.eventId),
      repo.getPurchasesByEvent(input.eventId),
      repo.getProductsByEvent(input.eventId),
    ]);

    const purchase = purchases.find((p) => p.id === input.purchaseId);
    if (!purchase) { console.warn(`${tag} Purchase not found`); return { success: false, error: "Purchase not found" }; }
    if (!event) { console.warn(`${tag} Event not found`); return { success: false, error: "Event not found" }; }
    if (purchase.paymentStatus === "refunded") { console.warn(`${tag} Refunded`); return { success: false, error: "Cannot send email for a refunded purchase" }; }

    const product = products.find((p) => p.id === purchase.eventProductId);
    if (!product) { console.warn(`${tag} Product not found`); return { success: false, error: "Product not found" }; }

    const isGuest = !purchase.studentId;
    const recipientEmail = isGuest
      ? purchase.guestEmail
      : (input.buyerEmail ?? null);

    console.info(`${tag} type=${isGuest ? "guest" : "student"} paymentStatus=${purchase.paymentStatus} recipientEmail=${recipientEmail ?? "none"} hasQR=${!!purchase.qrToken}`);

    if (!recipientEmail && isGuest) {
      console.warn(`${tag} No email for guest`);
      return { success: false, error: "No email address for this guest" };
    }

    const data = buildEmailData(purchase, product, event);
    if (recipientEmail) data.directEmail = recipientEmail;

    console.info(`${tag} Calling sendEventPurchaseEmail…`);
    const result = await sendEventPurchaseEmail(data);
    console.info(`${tag} sendEventPurchaseEmail returned sent=${result.sent}${!result.sent ? ` reason="${result.reason}"` : ""}`);

    const emailType = purchase.paymentStatus === "paid" ? "confirmation" : "pending_reminder";
    let trackingFailed = false;
    try {
      await getSpecialEventRepo().updatePurchaseEmailTracking(input.purchaseId, {
        lastEmailType: emailType,
        lastEmailSentAt: new Date().toISOString(),
        lastEmailSuccess: result.sent,
      });
    } catch (trackErr) {
      trackingFailed = true;
      console.error(`${tag} Tracking update failed (non-critical):`, trackErr instanceof Error ? trackErr.message : trackErr);
    }

    revalidatePath(`/events/${input.eventId}`);

    if (!result.sent) return { success: false, error: result.reason, trackingFailed };
    return { success: true, sent: true, trackingFailed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${tag} Unhandled error:`, msg);
    return { success: false, error: `Resend failed: ${msg}` };
  }
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

// ══════════════════════════════════════════════════════════════
// DAY-BEFORE EVENT REMINDER
// ══════════════════════════════════════════════════════════════

export interface ReminderResult {
  success: boolean;
  error?: string;
  sentCount?: number;
  failedCount?: number;
}

export async function sendEventReminderAction(input: {
  eventId: string;
}): Promise<ReminderResult> {
  await requirePermission("events:edit");

  if (!isEmailEnabled()) return { success: false, error: "Email sending is not configured (BREVO_API_KEY missing)" };

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(input.eventId);
  if (!event) return { success: false, error: "Event not found" };

  const purchases = await repo.getPurchasesByEvent(input.eventId);
  const activePurchases = purchases.filter((p) => p.paymentStatus !== "refunded");
  if (activePurchases.length === 0) return { success: false, error: "No active purchases to notify" };

  const products = await repo.getProductsByEvent(input.eventId);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const dateRange = formatEventDateRange(event.startDate, event.endDate);
  const { getAppUrl } = await import("@/lib/utils/app-url");
  const appUrl = getAppUrl();
  const eventUrl = `${appUrl}/event/${event.id}`;

  let sentCount = 0;
  let failedCount = 0;

  for (const purchase of activePurchases) {
    const isGuest = !purchase.studentId;
    const product = productMap.get(purchase.eventProductId);
    const recipientName = isGuest ? (purchase.guestName ?? "Guest") : "there";
    const isPaid = purchase.paymentStatus === "paid";

    let email: string | null = null;
    if (isGuest) {
      email = purchase.guestEmail;
    } else if (purchase.studentId) {
      email = await resolveStudentEmail(purchase.studentId);
    }
    if (!email) { failedCount++; continue; }

    const detailRows: { label: string; valueHtml: string }[] = [
      { label: "Event", valueHtml: `<strong>${event.title}</strong>` },
      { label: "When", valueHtml: dateRange },
    ];
    if (event.location) {
      detailRows.push({ label: "Where", valueHtml: event.location });
    }
    detailRows.push(
      { label: "Product", valueHtml: product?.name ?? "Event pass" },
      { label: "Status", valueHtml: bpmStatusBadge(isPaid ? "paid" : "pending") },
    );
    const detailsHtml = bpmDetailsCard(detailRows, "Your event");

    const pendingNotice = !isPaid
      ? bpmNotice("warning", "<strong>Payment reminder:</strong> Please complete your payment at reception when you arrive.")
      : "";

    const showQr = isGuest && isPaid && purchase.qrToken;
    const qrHtml = showQr ? bpmQrBlock(purchase.qrToken!) : "";

    const guidanceText = isGuest && showQr
      ? "Show your QR code at reception for a quick check-in."
      : isGuest
        ? "Give your name at reception when you arrive."
        : "Use your BPM student QR code for check-in at reception.";
    const arrivalGuidance = bpmNotice("info", guidanceText);

    const ctaHtml = bpmCtaButton(eventUrl, "View event details");

    const bodyHtml = `${detailsHtml}${pendingNotice}${arrivalGuidance}${qrHtml}${ctaHtml}`;

    const html = bpmEmailWrap({
      appUrl,
      recipientName,
      heading: `Reminder: ${event.title} is coming up!`,
      bodyHtml,
      coverImageUrl: event.coverImageUrl ?? undefined,
      eventTitle: event.title,
    });
    const subject = `Reminder: ${event.title} — ${dateRange}`;

    const ok = await sendEmail({ to: email, subject, html });
    const emailResult: EmailSendResult = ok ? { sent: true } : { sent: false, reason: "Provider rejected" };
    await trackEmailSend(purchase.id, "event_reminder", emailResult);

    if (ok) sentCount++;
    else failedCount++;
  }

  revalidatePath(`/events/${input.eventId}`);
  return { success: true, sentCount, failedCount };
}
