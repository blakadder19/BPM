/**
 * Email template builders for each communication event type.
 *
 * Produces { subject, html } pairs. Templates use inline styles
 * for maximum email-client compatibility. No external CSS.
 */

import { formatTime } from "@/lib/utils";
import type {
  CommEventType,
  CommEventPayloadMap,
  ClassCancelledPayload,
  PaymentPendingPayload,
  RenewalPreparedPayload,
  RenewalDueSoonPayload,
  WaitlistPromotedPayload,
  BookingReminderPayload,
  BirthdayBenefitAvailablePayload,
} from "./events";

export interface EmailContent {
  subject: string;
  html: string;
}

function wrap(studentName: string, heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#18181b;padding:20px 24px;">
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
    <td style="padding:6px 0;color:#71717a;font-size:14px;width:120px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#18181b;font-size:14px;font-weight:500;">${value}</td>
  </tr>`;
}

// ── Per-event templates ──────────────────────────────────────

function classCancelled(
  studentName: string,
  p: ClassCancelledPayload
): EmailContent {
  const creditNote = p.creditReverted
    ? `<p style="margin:16px 0 0;padding:12px;background:#f0fdf4;border-radius:6px;color:#166534;font-size:14px;">Your class credit has been returned automatically.</p>`
    : "";

  return {
    subject: `Class cancelled: ${p.classTitle} on ${p.classDate}`,
    html: wrap(
      studentName,
      "A class has been cancelled",
      `<table style="width:100%;" cellpadding="0" cellspacing="0">
        ${infoRow("Class", p.classTitle)}
        ${infoRow("Date", p.classDate)}
        ${infoRow("Time", formatTime(p.startTime))}
      </table>
      <p style="margin:16px 0 0;color:#52525b;font-size:14px;">
        This class was cancelled by the academy. We apologise for any inconvenience.
      </p>
      ${creditNote}`
    ),
  };
}

function paymentPending(
  studentName: string,
  p: PaymentPendingPayload
): EmailContent {
  const amountRow = p.amountLabel ? infoRow("Amount", p.amountLabel) : "";
  const termRow = p.termName ? infoRow("Term", p.termName) : "";

  return {
    subject: `Payment pending: ${p.productName}`,
    html: wrap(
      studentName,
      "Payment pending for your plan",
      `<table style="width:100%;" cellpadding="0" cellspacing="0">
        ${infoRow("Plan", p.productName)}
        ${termRow}
        ${amountRow}
      </table>
      <p style="margin:16px 0 0;color:#52525b;font-size:14px;">
        Your plan is active and awaiting payment. Please complete payment at reception
        or contact us to arrange an alternative.
      </p>`
    ),
  };
}

function renewalPrepared(
  studentName: string,
  p: RenewalPreparedPayload
): EmailContent {
  const period = p.validUntil
    ? `${p.validFrom} – ${p.validUntil}`
    : `From ${p.validFrom}`;

  return {
    subject: `Membership renewed: ${p.productName} for ${p.termName}`,
    html: wrap(
      studentName,
      "Your membership has been renewed",
      `<table style="width:100%;" cellpadding="0" cellspacing="0">
        ${infoRow("Plan", p.productName)}
        ${infoRow("Term", p.termName)}
        ${infoRow("Period", period)}
      </table>
      <p style="margin:16px 0 0;color:#52525b;font-size:14px;">
        Your membership has been automatically renewed for the upcoming term.
        Payment is pending — please arrange payment at reception to keep your
        membership active.
      </p>`
    ),
  };
}

function renewalDueSoon(
  studentName: string,
  p: RenewalDueSoonPayload
): EmailContent {
  const dayWord = p.daysUntilStart === 1 ? "day" : "days";

  return {
    subject: `Renewal payment due soon: ${p.productName}`,
    html: wrap(
      studentName,
      "Your renewal payment is due soon",
      `<table style="width:100%;" cellpadding="0" cellspacing="0">
        ${infoRow("Plan", p.productName)}
        ${infoRow("Term", p.termName)}
        ${infoRow("Starts in", `${p.daysUntilStart} ${dayWord}`)}
      </table>
      <p style="margin:16px 0 0;color:#52525b;font-size:14px;">
        The new term is approaching. Please arrange payment at reception to ensure
        uninterrupted access to your classes.
      </p>`
    ),
  };
}

function waitlistPromoted(
  studentName: string,
  p: WaitlistPromotedPayload
): EmailContent {
  return {
    subject: `You're in! Spot confirmed for ${p.classTitle}`,
    html: wrap(
      studentName,
      "A spot opened up — you're confirmed!",
      `<table style="width:100%;" cellpadding="0" cellspacing="0">
        ${infoRow("Class", p.classTitle)}
        ${infoRow("Date", p.classDate)}
        ${infoRow("Time", formatTime(p.startTime))}
      </table>
      <p style="margin:16px 0 0;color:#52525b;font-size:14px;">
        A spot opened up and you've been automatically moved from the waitlist
        to a confirmed booking. No action needed — just show up and enjoy the class!
      </p>`
    ),
  };
}

function bookingReminder(
  studentName: string,
  p: BookingReminderPayload
): EmailContent {
  const hourWord = p.hoursUntilStart === 1 ? "hour" : "hours";

  return {
    subject: `Reminder: ${p.classTitle} in ${p.hoursUntilStart} ${hourWord}`,
    html: wrap(
      studentName,
      "Your class is coming up",
      `<table style="width:100%;" cellpadding="0" cellspacing="0">
        ${infoRow("Class", p.classTitle)}
        ${infoRow("Date", p.classDate)}
        ${infoRow("Time", formatTime(p.startTime))}
        ${infoRow("Starts in", `${p.hoursUntilStart} ${hourWord}`)}
      </table>
      <p style="margin:16px 0 0;color:#52525b;font-size:14px;">
        If you can no longer attend, please cancel in advance to avoid a late cancellation penalty.
      </p>`
    ),
  };
}

function birthdayBenefitAvailable(
  studentName: string,
  p: BirthdayBenefitAvailablePayload
): EmailContent {
  return {
    subject: "Happy birthday from BPM! Your free class is waiting",
    html: wrap(
      studentName,
      "Happy birthday! 🎂",
      `<p style="margin:0 0 16px;color:#52525b;font-size:14px;">
        As a BPM member, you get a <strong>free class</strong> during your birthday week.
      </p>
      <table style="width:100%;" cellpadding="0" cellspacing="0">
        ${infoRow("Benefit", p.benefitDescription)}
        ${infoRow("Available until", p.expiresDate)}
      </table>
      <p style="margin:16px 0 0;color:#52525b;font-size:14px;">
        Book any class by the date above and select "Birthday Free Class" as your
        entitlement to redeem this benefit. Enjoy your special week!
      </p>`
    ),
  };
}

// ── Registry ─────────────────────────────────────────────────

type TemplateBuilder<T extends CommEventType> = (
  studentName: string,
  payload: CommEventPayloadMap[T]
) => EmailContent;

const TEMPLATES: {
  [K in CommEventType]: TemplateBuilder<K>;
} = {
  class_cancelled: classCancelled,
  payment_pending: paymentPending,
  renewal_prepared: renewalPrepared,
  renewal_due_soon: renewalDueSoon,
  waitlist_promoted: waitlistPromoted,
  booking_reminder: bookingReminder,
  birthday_benefit_available: birthdayBenefitAvailable,
};

/**
 * Build email subject + HTML body for any communication event.
 */
export function buildEmailContent<T extends CommEventType>(
  type: T,
  studentName: string,
  payload: CommEventPayloadMap[T]
): EmailContent {
  const builder = TEMPLATES[type] as TemplateBuilder<T>;
  return builder(studentName, payload);
}
