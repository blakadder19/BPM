import "server-only";

/**
 * Transactional emails for special event purchases.
 *
 * Separate from the generic CommEvent system because event purchases
 * are a distinct domain that doesn't need in-app bell notifications
 * or idempotency tracking for purchase confirmations.
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

  console.info(`${tag} Preparing email to ${email} (paymentStatus=${data.paymentStatus}, hasQr=${!!data.qrToken})`);

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
    { label: "Event", valueHtml: `<strong>${data.eventTitle}</strong>` },
    { label: "Product", valueHtml: data.productName },
    { label: "Price", valueHtml: `<strong>${data.priceLabel}</strong>` },
    { label: "Status", valueHtml: bpmStatusBadge(data.paymentStatus) },
  ];
  const detailsHtml = bpmDetailsCard(detailRows);

  // Inclusion summary
  const inclusionHtml = data.inclusionSummary
    ? bpmNotice("coral", `<strong>What's included:</strong> ${data.inclusionSummary}`)
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

  const ctaHtml = bpmCtaButton(eventUrl, "View event details");

  const bodyHtml = `${detailsHtml}${inclusionHtml}${pendingHtml}${checkinHtml}${ctaHtml}`;

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
    { label: "Event", valueHtml: `<strong>${data.eventTitle}</strong>` },
    { label: "Product", valueHtml: data.productName },
    { label: "Refunded amount", valueHtml: `<strong>${data.amountLabel}</strong>` },
    { label: "Status", valueHtml: `<span style="color:${B.BPM_500};font-weight:600;">Refunded</span>` },
  ];
  if (data.refundReason) {
    detailRows.push({ label: "Reason", valueHtml: data.refundReason });
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
