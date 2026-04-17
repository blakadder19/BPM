/**
 * Email template builders for each communication event type.
 *
 * Uses the shared BPM branded design system (email-brand.ts) so all
 * outgoing emails — whether triggered by system events, admin actions,
 * or broadcasts — share the same logo, palette, layout, and footer.
 */

import { formatTime } from "@/lib/utils";
import { getAppUrl } from "@/lib/utils/app-url";
import {
  bpmEmailWrap,
  bpmStatusBadge,
  bpmDetailsCard,
  bpmNotice,
  bpmCtaButton,
  B,
} from "./email-brand";
import type {
  CommEventType,
  CommEventPayloadMap,
  ClassCancelledPayload,
  PaymentPendingPayload,
  PaymentConfirmedPayload,
  SubscriptionRefundedPayload,
  RenewalPreparedPayload,
  RenewalDueSoonPayload,
  WaitlistPromotedPayload,
  BookingReminderPayload,
  BirthdayBenefitAvailablePayload,
  EventAnnouncementPayload,
  AdminBroadcastPayload,
} from "./events";

export interface EmailContent {
  subject: string;
  html: string;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;color:${B.ZINC_700};font-size:14px;line-height:1.6;">${text}</p>`;
}

// ── Per-event templates ──────────────────────────────────────

function classCancelled(
  studentName: string,
  p: ClassCancelledPayload
): EmailContent {
  const appUrl = getAppUrl();
  const creditHtml = p.creditReverted
    ? bpmNotice("info", "Your class credit has been returned automatically.")
    : "";

  const bodyHtml = [
    bpmDetailsCard([
      { label: "Class", valueHtml: `<strong>${p.classTitle}</strong>` },
      { label: "Date", valueHtml: p.classDate },
      { label: "Time", valueHtml: formatTime(p.startTime) },
    ], "Cancelled class"),
    bpmNotice("warning", "This class was cancelled by the academy. We apologise for any inconvenience."),
    creditHtml,
    bpmCtaButton(`${appUrl}/bookings`, "View your bookings"),
  ].join("\n");

  return {
    subject: `Class cancelled: ${p.classTitle} on ${p.classDate}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "A class has been cancelled", bodyHtml }),
  };
}

function paymentPending(
  studentName: string,
  p: PaymentPendingPayload
): EmailContent {
  const appUrl = getAppUrl();
  const rows = [
    { label: "Plan", valueHtml: `<strong>${p.productName}</strong>` },
    ...(p.termName ? [{ label: "Term", valueHtml: p.termName }] : []),
    ...(p.amountLabel ? [{ label: "Amount", valueHtml: `<strong>${p.amountLabel}</strong>` }] : []),
    { label: "Status", valueHtml: bpmStatusBadge("pending") },
  ];

  const bodyHtml = [
    bpmDetailsCard(rows, "Subscription details"),
    bpmNotice("warning", "Your plan is active and awaiting payment. Please complete payment at reception or contact us to arrange an alternative."),
    bpmCtaButton(`${appUrl}/dashboard`, "Go to dashboard"),
  ].join("\n");

  return {
    subject: `Payment pending: ${p.productName}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "Payment pending for your plan", bodyHtml }),
  };
}

function paymentConfirmed(
  studentName: string,
  p: PaymentConfirmedPayload
): EmailContent {
  const appUrl = getAppUrl();
  const rows = [
    { label: "Plan", valueHtml: `<strong>${p.productName}</strong>` },
    ...(p.amountLabel ? [{ label: "Amount", valueHtml: `<strong>${p.amountLabel}</strong>` }] : []),
    ...(p.paymentMethod ? [{ label: "Method", valueHtml: p.paymentMethod }] : []),
    { label: "Status", valueHtml: bpmStatusBadge("paid") },
  ];

  const bodyHtml = [
    bpmDetailsCard(rows, "Payment details"),
    bpmNotice("info", "Your payment has been received and your plan is now fully active. Thank you!"),
    bpmCtaButton(`${appUrl}/dashboard`, "Go to dashboard"),
  ].join("\n");

  return {
    subject: `Payment confirmed: ${p.productName}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "Payment received — thank you!", bodyHtml }),
  };
}

function subscriptionRefunded(
  studentName: string,
  p: SubscriptionRefundedPayload
): EmailContent {
  const appUrl = getAppUrl();
  const rows = [
    { label: "Plan", valueHtml: `<strong>${p.productName}</strong>` },
    ...(p.amountLabel ? [{ label: "Refunded", valueHtml: `<strong>${p.amountLabel}</strong>` }] : []),
    { label: "Status", valueHtml: `<span style="color:${B.BPM_500};font-weight:600;">Refunded</span>` },
    ...(p.refundReason ? [{ label: "Reason", valueHtml: p.refundReason }] : []),
    { label: "Entitlement", valueHtml: p.entitlementCancelled ? "Cancelled" : "Still active" },
  ];

  const bodyHtml = [
    bpmDetailsCard(rows, "Refund details"),
    bpmNotice("warning", "A refund has been processed for your plan. If you have any questions, please contact us at reception."),
    bpmCtaButton(`${appUrl}/dashboard`, "Go to dashboard"),
  ].join("\n");

  return {
    subject: `Refund processed: ${p.productName}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "Refund processed", bodyHtml }),
  };
}

function renewalPrepared(
  studentName: string,
  p: RenewalPreparedPayload
): EmailContent {
  const appUrl = getAppUrl();
  const period = p.validUntil ? `${p.validFrom} – ${p.validUntil}` : `From ${p.validFrom}`;

  const bodyHtml = [
    bpmDetailsCard([
      { label: "Plan", valueHtml: `<strong>${p.productName}</strong>` },
      { label: "Term", valueHtml: p.termName },
      { label: "Period", valueHtml: period },
      { label: "Status", valueHtml: bpmStatusBadge("pending") },
    ], "Renewal details"),
    bpmNotice("warning", "Your membership has been automatically renewed. Payment is pending — please arrange payment at reception to keep your membership active."),
    bpmCtaButton(`${appUrl}/dashboard`, "Go to dashboard"),
  ].join("\n");

  return {
    subject: `Membership renewed: ${p.productName} for ${p.termName}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "Your membership has been renewed", bodyHtml }),
  };
}

function renewalDueSoon(
  studentName: string,
  p: RenewalDueSoonPayload
): EmailContent {
  const appUrl = getAppUrl();
  const dayWord = p.daysUntilStart === 1 ? "day" : "days";

  const bodyHtml = [
    bpmDetailsCard([
      { label: "Plan", valueHtml: `<strong>${p.productName}</strong>` },
      { label: "Term", valueHtml: p.termName },
      { label: "Starts in", valueHtml: `<strong>${p.daysUntilStart} ${dayWord}</strong>` },
      { label: "Status", valueHtml: bpmStatusBadge("pending") },
    ], "Renewal details"),
    bpmNotice("warning", "The new term is approaching. Please arrange payment at reception to ensure uninterrupted access to your classes."),
    bpmCtaButton(`${appUrl}/dashboard`, "Go to dashboard"),
  ].join("\n");

  return {
    subject: `Renewal payment due soon: ${p.productName}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "Your renewal payment is due soon", bodyHtml }),
  };
}

function waitlistPromoted(
  studentName: string,
  p: WaitlistPromotedPayload
): EmailContent {
  const appUrl = getAppUrl();
  const bodyHtml = [
    bpmDetailsCard([
      { label: "Class", valueHtml: `<strong>${p.classTitle}</strong>` },
      { label: "Date", valueHtml: p.classDate },
      { label: "Time", valueHtml: formatTime(p.startTime) },
    ], "Booking confirmed"),
    bpmNotice("info", "A spot opened up and you've been automatically moved from the waitlist to a confirmed booking. No action needed — just show up and enjoy the class!"),
    bpmCtaButton(`${appUrl}/bookings`, "View your bookings"),
  ].join("\n");

  return {
    subject: `You're in! Spot confirmed for ${p.classTitle}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "A spot opened up — you're confirmed!", bodyHtml }),
  };
}

function bookingReminder(
  studentName: string,
  p: BookingReminderPayload
): EmailContent {
  const appUrl = getAppUrl();
  const hourWord = p.hoursUntilStart === 1 ? "hour" : "hours";

  const bodyHtml = [
    bpmDetailsCard([
      { label: "Class", valueHtml: `<strong>${p.classTitle}</strong>` },
      { label: "Date", valueHtml: p.classDate },
      { label: "Time", valueHtml: formatTime(p.startTime) },
      { label: "Starts in", valueHtml: `<strong>${p.hoursUntilStart} ${hourWord}</strong>` },
    ], "Class reminder"),
    bpmNotice("info", "If you can no longer attend, please cancel in advance to avoid a late cancellation penalty."),
    bpmCtaButton(`${appUrl}/bookings`, "View your bookings"),
  ].join("\n");

  return {
    subject: `Reminder: ${p.classTitle} in ${p.hoursUntilStart} ${hourWord}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "Your class is coming up", bodyHtml }),
  };
}

function birthdayBenefitAvailable(
  studentName: string,
  p: BirthdayBenefitAvailablePayload
): EmailContent {
  const appUrl = getAppUrl();
  const bodyHtml = [
    bpmDetailsCard([
      { label: "Benefit", valueHtml: `<strong>${p.benefitDescription}</strong>` },
      { label: "Valid until", valueHtml: `<strong>${p.expiresDate}</strong>` },
    ], "Birthday benefit"),
    bpmNotice("coral", 'As a BPM member, you get a <strong>free class</strong> during your birthday week. Book any class by the date above and select "Birthday Free Class" as your entitlement. Enjoy your special week!'),
    bpmCtaButton(`${appUrl}/classes`, "Book a class"),
  ].join("\n");

  return {
    subject: "Happy birthday from BPM! Your free class is waiting",
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: "Happy birthday! 🎂", bodyHtml }),
  };
}

function eventAnnouncement(
  studentName: string,
  p: EventAnnouncementPayload
): EmailContent {
  const appUrl = getAppUrl();
  const eventUrl = `${appUrl}/event/${p.eventId}`;
  const rows = [
    ...(p.dates ? [{ label: "When", valueHtml: `<strong>${p.dates}</strong>` }] : []),
    ...(p.location ? [{ label: "Where", valueHtml: p.location }] : []),
  ];

  const bodyHtml = [
    ...(rows.length > 0 ? [bpmDetailsCard(rows, "Event details")] : []),
    bpmNotice("coral", p.shortDescription),
    bpmCtaButton(eventUrl, "View event & tickets"),
  ].join("\n");

  return {
    subject: `Special Event: ${p.eventTitle}`,
    html: bpmEmailWrap({ appUrl, recipientName: studentName, heading: p.eventTitle, bodyHtml }),
  };
}

function adminBroadcast(
  studentName: string,
  p: AdminBroadcastPayload
): EmailContent {
  const appUrl = getAppUrl();
  const bodyHtml = p.body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => paragraph(line))
    .join("");

  return {
    subject: p.title,
    html: bpmEmailWrap({
      appUrl,
      recipientName: studentName,
      heading: p.title,
      bodyHtml: bodyHtml || paragraph(p.body),
    }),
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
  payment_confirmed: paymentConfirmed,
  subscription_refunded: subscriptionRefunded,
  renewal_prepared: renewalPrepared,
  renewal_due_soon: renewalDueSoon,
  waitlist_promoted: waitlistPromoted,
  booking_reminder: bookingReminder,
  birthday_benefit_available: birthdayBenefitAvailable,
  event_announcement: eventAnnouncement,
  admin_broadcast: adminBroadcast,
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
