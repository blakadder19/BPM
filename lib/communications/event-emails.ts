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

// BPM brand colours (inline-safe hex values)
const BPM_DARK = "#18181b";
const BPM_CORAL = "#e8533f";
const BPM_CORAL_LIGHT = "#fef2f0";
const BPM_GREEN = "#166534";
const BPM_GREEN_BG = "#f0fdf4";
const BPM_AMBER = "#854d0e";
const BPM_AMBER_BG = "#fefce8";
const BPM_ZINC_100 = "#f4f4f5";
const BPM_ZINC_300 = "#d4d4d8";
const BPM_ZINC_500 = "#71717a";
const BPM_ZINC_700 = "#3f3f46";

function wrap(recipientName: string, heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BPM_ZINC_100};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BPM_ZINC_100};padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <!-- Header with BPM gradient -->
  <tr><td style="background:linear-gradient(135deg,${BPM_DARK} 0%,#27272a 60%,${BPM_CORAL} 100%);padding:24px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">BPM</span>
          <span style="color:rgba(255,255,255,0.7);font-size:14px;font-weight:400;margin-left:8px;">Balance Power Motion</span>
        </td>
      </tr>
    </table>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:28px;">
    <p style="margin:0 0 4px;color:${BPM_ZINC_500};font-size:14px;">Hi ${recipientName},</p>
    <h2 style="margin:8px 0 20px;color:${BPM_DARK};font-size:22px;font-weight:700;line-height:1.3;">${heading}</h2>
    ${bodyHtml}
  </td></tr>
  <!-- Footer -->
  <tr><td style="padding:20px 28px;background:${BPM_ZINC_100};border-top:1px solid ${BPM_ZINC_300};">
    <p style="margin:0;color:${BPM_ZINC_500};font-size:12px;line-height:1.5;">
      Balance Power Motion — Dublin's social dance academy.<br>
      This is an automated message. Please do not reply directly.
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function detailRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:8px 12px;color:${BPM_ZINC_500};font-size:13px;width:120px;vertical-align:top;border-bottom:1px solid ${BPM_ZINC_100};">${label}</td>
    <td style="padding:8px 12px;color:${BPM_DARK};font-size:14px;font-weight:500;border-bottom:1px solid ${BPM_ZINC_100};">${valueHtml}</td>
  </tr>`;
}

function qrBlock(token: string): string {
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(token)}&size=200x200&margin=8`;
  return `
    <div style="margin:20px 0;padding:20px;background:${BPM_ZINC_100};border-radius:10px;text-align:center;border:1px solid ${BPM_ZINC_300};">
      <p style="margin:0 0 14px;color:${BPM_DARK};font-size:15px;font-weight:600;">Your event check-in QR code</p>
      <img src="${qrImageUrl}" alt="QR Code" width="180" height="180" style="display:block;margin:0 auto 14px;border-radius:6px;" />
      <p style="margin:0;color:${BPM_ZINC_500};font-size:12px;">Reference: <code style="background:#e4e4e7;padding:2px 6px;border-radius:3px;font-size:11px;">${token}</code></p>
      <p style="margin:10px 0 0;color:${BPM_ZINC_700};font-size:13px;">Show this QR code at reception when you arrive.</p>
    </div>`;
}

function posterBlock(imageUrl: string, eventTitle: string): string {
  return `
    <div style="margin:0 0 20px;text-align:center;">
      <img src="${imageUrl}" alt="${eventTitle}" width="280" style="display:block;margin:0 auto;border-radius:10px;max-width:100%;height:auto;box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
    </div>`;
}

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
  /** If present and payment is paid, includes QR in the email */
  qrToken?: string;
  /** Optional event cover image URL for poster thumbnail */
  coverImageUrl?: string;
}

export type EmailSendResult = { sent: true } | { sent: false; reason: string };

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

  const statusBadgeHtml = isPaid
    ? `<span style="display:inline-block;padding:5px 12px;background:${BPM_GREEN_BG};color:${BPM_GREEN};border-radius:20px;font-size:13px;font-weight:600;">&#10003; Paid</span>`
    : `<span style="display:inline-block;padding:5px 12px;background:${BPM_AMBER_BG};color:${BPM_AMBER};border-radius:20px;font-size:13px;font-weight:600;">Pending — pay at reception</span>`;

  const eventUrl = `${getAppUrl()}/event/${data.eventId}`;
  const subject = isPaid
    ? `Purchase confirmed: ${data.productName} — ${data.eventTitle}`
    : `Purchase registered: ${data.productName} — ${data.eventTitle}`;

  const heading = isPaid ? "Your event purchase is confirmed" : "Your event purchase is registered";

  const showQr = isGuest && isPaid && data.qrToken;

  // Event poster thumbnail (if available)
  const posterHtml = data.coverImageUrl ? posterBlock(data.coverImageUrl, data.eventTitle) : "";

  // Purchase details card
  const detailsCard = `
    <div style="margin:0 0 20px;border:1px solid ${BPM_ZINC_300};border-radius:10px;overflow:hidden;">
      <div style="padding:12px 12px;background:${BPM_ZINC_100};">
        <span style="font-size:12px;font-weight:600;color:${BPM_ZINC_700};text-transform:uppercase;letter-spacing:0.5px;">Purchase details</span>
      </div>
      <table style="width:100%;" cellpadding="0" cellspacing="0">
        ${detailRow("Event", `<strong>${data.eventTitle}</strong>`)}
        ${detailRow("Product", data.productName)}
        ${detailRow("Price", data.priceLabel)}
        ${detailRow("Status", statusBadgeHtml)}
      </table>
    </div>`;

  // Inclusion summary
  const inclusionHtml = data.inclusionSummary
    ? `<div style="margin:0 0 20px;padding:14px 16px;background:${BPM_CORAL_LIGHT};border-radius:8px;border-left:3px solid ${BPM_CORAL};">
         <p style="margin:0;color:${BPM_ZINC_700};font-size:13px;line-height:1.5;"><strong>What's included:</strong> ${data.inclusionSummary}</p>
       </div>`
    : "";

  // Pending payment notice
  const pendingNotice = !isPaid
    ? `<div style="margin:0 0 20px;padding:14px 16px;background:${BPM_AMBER_BG};border-radius:8px;border-left:3px solid ${BPM_AMBER};">
         <p style="margin:0;color:${BPM_AMBER};font-size:13px;line-height:1.5;">Please complete your payment at the BPM reception before or on the day of the event.</p>
       </div>`
    : "";

  // Check-in instruction
  let checkinHtml: string;
  if (showQr) {
    checkinHtml = qrBlock(data.qrToken!);
  } else if (isGuest) {
    checkinHtml = `<div style="margin:0 0 20px;padding:14px 16px;background:#f0f9ff;border-radius:8px;border-left:3px solid #0284c7;">
      <p style="margin:0;color:#0c4a6e;font-size:13px;line-height:1.5;">When you arrive, give your name at reception for check-in.${!isPaid ? " Your QR code will be sent once payment is confirmed." : ""}</p>
    </div>`;
  } else {
    checkinHtml = `<div style="margin:0 0 20px;padding:14px 16px;background:#f0f9ff;border-radius:8px;border-left:3px solid #0284c7;">
      <p style="margin:0;color:#0c4a6e;font-size:13px;line-height:1.5;">When attending, use your normal BPM student QR code for check-in. No separate event QR is needed.</p>
    </div>`;
  }

  // CTA button
  const ctaHtml = `<p style="margin:0;text-align:center;">
    <a href="${eventUrl}" style="display:inline-block;padding:12px 28px;background:${BPM_CORAL};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">View event details</a>
  </p>`;

  const bodyHtml = `${posterHtml}${detailsCard}${inclusionHtml}${pendingNotice}${checkinHtml}${ctaHtml}`;

  const html = wrap(data.studentName, heading, bodyHtml);
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
