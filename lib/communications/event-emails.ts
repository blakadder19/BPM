import "server-only";

/**
 * Transactional emails for special event purchases.
 *
 * Separate from the generic CommEvent system because event purchases
 * are a distinct domain that doesn't need in-app bell notifications.
 * Duplicate suppression lives with the callers: a confirmation is sent
 * only by the call that created or marked the purchase paid, and a guest
 * receipt link only when a new token could be claimed for the purchase.
 *
 * Every interpolated value is escaped: guest names, titles and reasons
 * are user-provided text.
 */

import { isEmailEnabled, sendEmail } from "./email-provider";
import { resolveStudentEmail } from "./email-resolver";
import { getAppUrl } from "@/lib/utils/app-url";
import {
  bpmEmailWrap,
  bpmStatusBadge,
  bpmDetailsCard,
  bpmNotice,
  bpmCtaButton,
  bpmQrBlock,
  bpmTextLink,
  escapeHtml,
  DOWNLOAD_RECEIPT_LABEL,
  VIEW_PAYMENTS_LABEL,
  B,
} from "./email-brand";

// ── Public types ──────────────────────────────────────────────

export interface EventPurchaseEmailData {
  studentId: string | null;
  studentName: string;
  directEmail?: string;
  eventTitle: string;
  eventId: string;
  productName: string;
  productType: string;
  priceLabel: string;
  paymentStatus: "paid" | "pending";
  inclusionSummary: string;
  qrToken?: string;
  coverImageUrl?: string;
  /**
   * Guest receipt link (`/receipt#<token>`). Only for a paid,
   * receipt-eligible guest purchase whose token was just issued; never
   * logged.
   */
  receiptUrl?: string;
}

export type EmailSendResult = { sent: true } | { sent: false; reason: string };

// ── Send logic ────────────────────────────────────────────────

export async function sendEventPurchaseEmail(data: EventPurchaseEmailData): Promise<EmailSendResult> {
  const tag = `[event-email ${data.eventTitle}]`;

  if (!isEmailEnabled()) {
    const reason = "BREVO_API_KEY not configured";
    console.warn(`${tag} ${reason} — email NOT sent to ${data.directEmail ?? data.studentId ?? "unknown"}.`);
    return { sent: false, reason };
  }

  let email: string | null = data.directEmail ?? null;
  if (!email && data.studentId) {
    email = await resolveStudentEmail(data.studentId);
  }
  if (!email) {
    const reason = "Could not resolve recipient email";
    console.warn(`${tag} ${reason} — email NOT sent.`);
    return { sent: false, reason };
  }

  console.info(
    `${tag} Preparing email to ${email} (paymentStatus=${data.paymentStatus}, hasQr=${!!data.qrToken}, hasReceiptLink=${!!data.receiptUrl})`,
  );

  const isGuest = !data.studentId;
  const isPaid = data.paymentStatus === "paid";
  const showQr = isGuest && isPaid && data.qrToken;
  const appUrl = getAppUrl();
  const eventUrl = `${appUrl}/event/${data.eventId}`;

  const subject = isPaid
    ? `Purchase confirmed: ${data.productName} — ${data.eventTitle}`
    : `Purchase registered: ${data.productName} — ${data.eventTitle}`;

  const heading = isPaid
    ? "Your event purchase is confirmed"
    : "Your event purchase is registered";

  // Purchase details card
  const detailRows = [
    { label: "Event", valueHtml: `<strong>${escapeHtml(data.eventTitle)}</strong>` },
    { label: "Product", valueHtml: escapeHtml(data.productName) },
    { label: "Price", valueHtml: `<strong>${escapeHtml(data.priceLabel)}</strong>` },
    { label: "Status", valueHtml: bpmStatusBadge(data.paymentStatus) },
  ];
  const detailsHtml = bpmDetailsCard(detailRows);

  // Inclusion summary
  const inclusionHtml = data.inclusionSummary
    ? bpmNotice("coral", `<strong>What's included:</strong> ${escapeHtml(data.inclusionSummary)}`)
    : "";

  // Pending payment notice
  const pendingHtml = !isPaid
    ? bpmNotice("warning", "Please complete your payment at the BPM reception before or on the day of the event.")
    : "";

  // Check-in instruction
  let checkinHtml: string;
  if (showQr) {
    checkinHtml = bpmQrBlock(data.qrToken!);
  } else if (isGuest) {
    const extra = !isPaid ? " Your QR code will be sent once payment is confirmed." : "";
    checkinHtml = bpmNotice("info", `When you arrive, give your name at reception for check-in.${extra}`);
  } else {
    checkinHtml = bpmNotice("info", "When attending, use your normal BPM student QR code for check-in. No separate event QR is needed.");
  }

  // Receipts: a guest gets a one-purchase link; a student finds every
  // receipt on /payments and never gets a public token.
  const receiptHtml = isPaid
    ? isGuest
      ? data.receiptUrl ? bpmCtaButton(data.receiptUrl, DOWNLOAD_RECEIPT_LABEL) : ""
      : bpmTextLink(`${appUrl}/payments`, VIEW_PAYMENTS_LABEL)
    : "";

  const ctaHtml = bpmCtaButton(eventUrl, "View event details");

  const bodyHtml = `${detailsHtml}${inclusionHtml}${pendingHtml}${checkinHtml}${ctaHtml}${receiptHtml}`;

  const html = bpmEmailWrap({
    appUrl,
    recipientName: data.studentName,
    heading,
    bodyHtml,
    coverImageUrl: data.coverImageUrl,
    eventTitle: data.eventTitle,
  });

  console.info(`${tag} Calling Brevo API to send to ${email}...`);
  const ok = await sendEmail({ to: email, subject, html });
  if (ok) {
    console.info(`${tag} SUCCESS — ${data.paymentStatus} purchase email delivered to ${email}.`);
    return { sent: true };
  } else {
    const reason = "Brevo API did not accept the email (check server logs for details)";
    console.error(`${tag} FAILED — ${reason}.`);
    return { sent: false, reason };
  }
}

// ── Refund confirmation email ──────────────────────────────────

export interface EventRefundEmailData {
  studentId: string | null;
  recipientName: string;
  directEmail?: string;
  eventTitle: string;
  eventId: string;
  productName: string;
  amountLabel: string;
  refundReason: string | null;
}

export async function sendEventRefundEmail(data: EventRefundEmailData): Promise<EmailSendResult> {
  const tag = `[event-refund-email ${data.eventTitle}]`;

  if (!isEmailEnabled()) {
    const reason = "BREVO_API_KEY not configured";
    console.warn(`${tag} ${reason} — email NOT sent.`);
    return { sent: false, reason };
  }

  let email: string | null = data.directEmail ?? null;
  if (!email && data.studentId) {
    email = await resolveStudentEmail(data.studentId);
  }
  if (!email) {
    const reason = "Could not resolve recipient email";
    console.warn(`${tag} ${reason} — email NOT sent.`);
    return { sent: false, reason };
  }

  const appUrl = getAppUrl();
  const subject = `Refund processed: ${data.productName} — ${data.eventTitle}`;

  const detailRows = [
    { label: "Event", valueHtml: `<strong>${escapeHtml(data.eventTitle)}</strong>` },
    { label: "Product", valueHtml: escapeHtml(data.productName) },
    { label: "Refunded amount", valueHtml: `<strong>${escapeHtml(data.amountLabel)}</strong>` },
    { label: "Status", valueHtml: `<span style="color:${B.BPM_500};font-weight:600;">Refunded</span>` },
  ];
  if (data.refundReason) {
    detailRows.push({ label: "Reason", valueHtml: escapeHtml(data.refundReason) });
  }
  const detailsHtml = bpmDetailsCard(detailRows);

  const noticeHtml = bpmNotice(
    "warning",
    "This purchase has been refunded. It is no longer valid for event entry or check-in.",
  );

  const ctaHtml = bpmCtaButton(`${appUrl}/event/${data.eventId}`, "View event details");
  const bodyHtml = `${detailsHtml}${noticeHtml}${ctaHtml}`;

  const html = bpmEmailWrap({
    appUrl,
    recipientName: data.recipientName,
    heading: "Your event purchase has been refunded",
    bodyHtml,
    eventTitle: data.eventTitle,
  });

  const ok = await sendEmail({ to: email, subject, html });
  if (ok) {
    console.info(`${tag} SUCCESS — refund email delivered to ${email}.`);
    return { sent: true };
  } else {
    const reason = "Brevo API did not accept the email";
    console.error(`${tag} FAILED — ${reason}.`);
    return { sent: false, reason };
  }
}

// ── Guest Payment Receipt link (staff send / resend) ───────────

export interface GuestReceiptEmailData {
  /** Always the guest email frozen on the purchase. */
  to: string;
  recipientName: string;
  eventTitle: string;
  productName: string;
  /** Formatted from the frozen amount paid. */
  amountLabel: string;
  /** `/receipt#<token>`; never logged. */
  receiptUrl: string;
}

export async function sendGuestReceiptEmail(data: GuestReceiptEmailData): Promise<EmailSendResult> {
  const tag = "[guest-receipt-email]";
  if (!isEmailEnabled()) {
    const reason = "BREVO_API_KEY not configured";
    console.warn(`${tag} ${reason} — email NOT sent.`);
    return { sent: false, reason };
  }

  const appUrl = getAppUrl();
  const detailsHtml = bpmDetailsCard([
    { label: "Event", valueHtml: `<strong>${escapeHtml(data.eventTitle)}</strong>` },
    { label: "Product", valueHtml: escapeHtml(data.productName) },
    { label: "Paid", valueHtml: `<strong>${escapeHtml(data.amountLabel)}</strong>` },
  ]);
  const noticeHtml = bpmNotice(
    "info",
    "Your payment receipt is ready. This link is personal to this purchase — please don't share it. Any earlier receipt link for this purchase no longer works.",
  );
  const html = bpmEmailWrap({
    appUrl,
    recipientName: data.recipientName,
    heading: "Your payment receipt",
    bodyHtml: `${detailsHtml}${noticeHtml}${bpmCtaButton(data.receiptUrl, DOWNLOAD_RECEIPT_LABEL)}`,
  });

  const ok = await sendEmail({ to: data.to, subject: `Payment receipt: ${data.productName} — ${data.eventTitle}`, html });
  if (ok) return { sent: true };
  const reason = "Brevo API did not accept the email";
  console.error(`${tag} FAILED — ${reason}.`);
  return { sent: false, reason };
}
