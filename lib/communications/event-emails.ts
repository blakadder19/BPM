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

function wrap(studentName: string, heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:linear-gradient(135deg,#18181b 0%,#27272a 100%);padding:20px 24px;">
    <span style="color:#ffffff;font-size:18px;font-weight:600;">BPM Dance Academy</span>
  </td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 4px;color:#71717a;font-size:14px;">Hi ${studentName},</p>
    <h2 style="margin:8px 0 16px;color:#18181b;font-size:20px;font-weight:600;">${heading}</h2>
    ${bodyHtml}
  </td></tr>
  <tr><td style="padding:16px 24px;background:#fafafa;border-top:1px solid #e4e4e7;">
    <p style="margin:0;color:#a1a1aa;font-size:12px;">
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

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#71717a;font-size:14px;width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:500;">${value}</td>
  </tr>`;
}

function qrBlock(token: string): string {
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(token)}&size=200x200&margin=8`;
  return `
    <div style="margin:16px 0;padding:16px;background:#f8f9fa;border-radius:8px;text-align:center;">
      <p style="margin:0 0 12px;color:#18181b;font-size:14px;font-weight:600;">Your event check-in QR code</p>
      <img src="${qrImageUrl}" alt="QR Code" width="180" height="180" style="display:block;margin:0 auto 12px;" />
      <p style="margin:0;color:#71717a;font-size:12px;">Reference: <code style="background:#e4e4e7;padding:2px 6px;border-radius:3px;font-size:11px;">${token}</code></p>
      <p style="margin:8px 0 0;color:#52525b;font-size:13px;">Show this QR code at reception when you arrive.</p>
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
  const statusBadge = isPaid
    ? `<span style="display:inline-block;padding:4px 10px;background:#f0fdf4;color:#166534;border-radius:4px;font-size:13px;font-weight:500;">Paid</span>`
    : `<span style="display:inline-block;padding:4px 10px;background:#fefce8;color:#854d0e;border-radius:4px;font-size:13px;font-weight:500;">Pending — pay at reception</span>`;

  const eventUrl = `${getAppUrl()}/event/${data.eventId}`;
  const subject = isPaid
    ? `Purchase confirmed: ${data.productName} — ${data.eventTitle}`
    : `Purchase registered: ${data.productName} — ${data.eventTitle}`;

  const heading = isPaid ? "Your event purchase is confirmed" : "Your event purchase is registered";

  const showQr = isGuest && isPaid && data.qrToken;

  const bodyHtml = `
    <table style="width:100%;" cellpadding="0" cellspacing="0">
      ${infoRow("Event", data.eventTitle)}
      ${infoRow("Product", data.productName)}
      ${infoRow("Price", data.priceLabel)}
      ${infoRow("Payment", "")}
    </table>
    <div style="margin:-8px 0 12px 140px;">${statusBadge}</div>
    ${data.inclusionSummary ? `<p style="margin:0 0 16px;padding:12px;background:#f8f9fa;border-radius:6px;color:#52525b;font-size:13px;"><strong>What's included:</strong> ${data.inclusionSummary}</p>` : ""}
    ${!isPaid ? `<p style="margin:0 0 16px;padding:12px;background:#fefce8;border-radius:6px;color:#854d0e;font-size:13px;">Please complete your payment at the BPM reception before or on the day of the event.</p>` : ""}
    ${showQr
      ? qrBlock(data.qrToken!)
      : isGuest
        ? `<p style="margin:0 0 16px;padding:12px;background:#f0f9ff;border-radius:6px;color:#0c4a6e;font-size:13px;">When you arrive, give your name at reception for check-in.${!isPaid ? " Your QR code will be sent once payment is confirmed." : ""}</p>`
        : `<p style="margin:0 0 16px;padding:12px;background:#f0f9ff;border-radius:6px;color:#0c4a6e;font-size:13px;">When attending, use your normal BPM student QR code for check-in. No separate event QR is needed.</p>`}
    <p style="margin:0;">
      <a href="${eventUrl}" style="display:inline-block;padding:10px 20px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View event details</a>
    </p>`;

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
