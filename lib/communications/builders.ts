/**
 * Convenience factories for creating CommEvent instances.
 *
 * Each builder accepts the minimal domain data needed and produces
 * a fully-formed CommEvent ready for dispatch.
 */

import type { CommEvent } from "./events";

let counter = 0;
function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

// ── class_cancelled ──────────────────────────────────────────

export function classCancelledEvent(input: {
  studentId: string;
  studentName: string;
  classTitle: string;
  classDate: string;
  startTime: string;
  creditReverted: boolean;
  /** e.g. classInstanceId — prevents duplicate notices for the same cancellation */
  classInstanceId?: string;
}): CommEvent<"class_cancelled"> {
  return {
    id: generateId("ccn"),
    studentId: input.studentId,
    studentName: input.studentName,
    type: "class_cancelled",
    payload: {
      classTitle: input.classTitle,
      classDate: input.classDate,
      startTime: input.startTime,
      creditReverted: input.creditReverted,
    },
    createdAt: new Date().toISOString(),
    idempotencyKey: input.classInstanceId
      ? `class_cancelled:${input.studentId}:${input.classInstanceId}`
      : undefined,
  };
}

// ── payment_pending ──────────────────────────────────────────

export function paymentPendingEvent(input: {
  studentId: string;
  studentName: string;
  productName: string;
  subscriptionId: string;
  termName?: string | null;
  amountLabel?: string | null;
}): CommEvent<"payment_pending"> {
  return {
    id: generateId("ppn"),
    studentId: input.studentId,
    studentName: input.studentName,
    type: "payment_pending",
    payload: {
      productName: input.productName,
      subscriptionId: input.subscriptionId,
      termName: input.termName ?? null,
      amountLabel: input.amountLabel ?? null,
    },
    createdAt: new Date().toISOString(),
    idempotencyKey: `payment_pending:${input.studentId}:${input.subscriptionId}`,
  };
}

// ── renewal_prepared ─────────────────────────────────────────

export function renewalPreparedEvent(input: {
  studentId: string;
  studentName: string;
  productName: string;
  subscriptionId: string;
  termName: string;
  validFrom: string;
  validUntil: string | null;
}): CommEvent<"renewal_prepared"> {
  return {
    id: generateId("rpn"),
    studentId: input.studentId,
    studentName: input.studentName,
    type: "renewal_prepared",
    payload: {
      productName: input.productName,
      subscriptionId: input.subscriptionId,
      termName: input.termName,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    },
    createdAt: new Date().toISOString(),
    idempotencyKey: `renewal_prepared:${input.studentId}:${input.subscriptionId}`,
  };
}

// ── renewal_due_soon ─────────────────────────────────────────

export function renewalDueSoonEvent(input: {
  studentId: string;
  studentName: string;
  productName: string;
  subscriptionId: string;
  termName: string;
  daysUntilStart: number;
}): CommEvent<"renewal_due_soon"> {
  return {
    id: generateId("rds"),
    studentId: input.studentId,
    studentName: input.studentName,
    type: "renewal_due_soon",
    payload: {
      productName: input.productName,
      subscriptionId: input.subscriptionId,
      termName: input.termName,
      daysUntilStart: input.daysUntilStart,
    },
    createdAt: new Date().toISOString(),
    idempotencyKey: `renewal_due_soon:${input.studentId}:${input.subscriptionId}`,
  };
}

// ── waitlist_promoted ─────────────────────────────────────────

export function waitlistPromotedEvent(input: {
  studentId: string;
  studentName: string;
  classTitle: string;
  classDate: string;
  startTime: string;
  /** Waitlist entry ID — prevents duplicate notices for the same promotion */
  waitlistId?: string;
}): CommEvent<"waitlist_promoted"> {
  return {
    id: generateId("wlp"),
    studentId: input.studentId,
    studentName: input.studentName,
    type: "waitlist_promoted",
    payload: {
      classTitle: input.classTitle,
      classDate: input.classDate,
      startTime: input.startTime,
    },
    createdAt: new Date().toISOString(),
    idempotencyKey: input.waitlistId
      ? `waitlist_promoted:${input.studentId}:${input.waitlistId}`
      : undefined,
  };
}

// ── booking_reminder ──────────────────────────────────────────

export function bookingReminderEvent(input: {
  studentId: string;
  studentName: string;
  classTitle: string;
  classDate: string;
  startTime: string;
  hoursUntilStart: number;
  /** e.g. bookingId — prevents duplicate reminders for the same booking */
  bookingId?: string;
}): CommEvent<"booking_reminder"> {
  return {
    id: generateId("brm"),
    studentId: input.studentId,
    studentName: input.studentName,
    type: "booking_reminder",
    payload: {
      classTitle: input.classTitle,
      classDate: input.classDate,
      startTime: input.startTime,
      hoursUntilStart: input.hoursUntilStart,
    },
    createdAt: new Date().toISOString(),
    idempotencyKey: input.bookingId
      ? `booking_reminder:${input.studentId}:${input.bookingId}`
      : undefined,
  };
}

// ── birthday_benefit_available ────────────────────────────────

export function birthdayBenefitAvailableEvent(input: {
  studentId: string;
  studentName: string;
  benefitDescription?: string;
  expiresDate: string;
  /** Year — used in idempotency key so the event fires once per birthday window */
  year: number;
}): CommEvent<"birthday_benefit_available"> {
  return {
    id: generateId("bba"),
    studentId: input.studentId,
    studentName: input.studentName,
    type: "birthday_benefit_available",
    payload: {
      benefitDescription:
        input.benefitDescription ?? "Free class during your birthday week",
      expiresDate: input.expiresDate,
    },
    createdAt: new Date().toISOString(),
    idempotencyKey: `birthday_benefit:${input.studentId}:${input.year}`,
  };
}
