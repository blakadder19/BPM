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
