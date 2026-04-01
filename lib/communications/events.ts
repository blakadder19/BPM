/**
 * Communication event types and structured payloads.
 *
 * Each event represents a real operational occurrence that should reach
 * a student via in-app notification and (eventually) email.
 *
 * The payload carries everything needed to build messages in any channel
 * without re-querying the database.
 */

// ── Event type registry ──────────────────────────────────────

export const COMM_EVENT_TYPES = [
  "class_cancelled",
  "payment_pending",
  "renewal_prepared",
  "renewal_due_soon",
] as const;

export type CommEventType = (typeof COMM_EVENT_TYPES)[number];

// ── Per-event payloads ───────────────────────────────────────

export interface ClassCancelledPayload {
  classTitle: string;
  classDate: string;
  startTime: string;
  creditReverted: boolean;
}

export interface PaymentPendingPayload {
  productName: string;
  subscriptionId: string;
  /** e.g. "Term 3 2025" */
  termName: string | null;
  amountLabel: string | null;
}

export interface RenewalPreparedPayload {
  productName: string;
  subscriptionId: string;
  termName: string;
  validFrom: string;
  validUntil: string | null;
}

export interface RenewalDueSoonPayload {
  productName: string;
  subscriptionId: string;
  termName: string;
  daysUntilStart: number;
}

// ── Discriminated union for all payloads ─────────────────────

export type CommEventPayloadMap = {
  class_cancelled: ClassCancelledPayload;
  payment_pending: PaymentPendingPayload;
  renewal_prepared: RenewalPreparedPayload;
  renewal_due_soon: RenewalDueSoonPayload;
};

// ── The full communication event ─────────────────────────────

export interface CommEvent<T extends CommEventType = CommEventType> {
  id: string;
  studentId: string;
  studentName: string;
  type: T;
  payload: CommEventPayloadMap[T];
  createdAt: string;
  /** Prevents duplicate events for the same operational action. */
  idempotencyKey?: string;
}
