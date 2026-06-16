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
  "payment_confirmed",
  "subscription_refunded",
  "renewal_prepared",
  "renewal_due_soon",
  "renewal_reminder",
  "waitlist_promoted",
  "booking_reminder",
  "birthday_benefit_available",
  "event_announcement",
  "admin_broadcast",
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
  /** Final amount due, formatted (e.g. "€58.50"). */
  amountLabel: string | null;
  /**
   * Optional frozen pricing snapshot (Phase 4). When present, the email
   * template renders a Subtotal / Discount / Total breakdown instead of
   * a single "Amount" row.
   */
  originalPriceCents?: number | null;
  discountAmountCents?: number | null;
  finalPriceCents?: number | null;
  appliedDiscountSummary?: string | null;
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

/**
 * Heads-up reminder fired BEFORE the current active subscription
 * reaches its `validUntil` (the auto-renewal trigger date).
 *
 * Distinct from `renewal_due_soon`:
 *   * `renewal_due_soon` fires once the *next* pending subscription row
 *     already exists and that term is about to start.
 *   * `renewal_reminder` fires earlier — against the CURRENT active
 *     subscription — to warn the student that their membership is
 *     about to roll over.
 *
 * Wording note (per the renewal-reminder spec):
 *   * `autoRenewConfirmed = true` → safe to say "set to renew automatically".
 *   * `autoRenewConfirmed = false` → use safer wording ("approaching its
 *      renewal date"). The template enforces this at render time so the
 *      wrong phrasing cannot leak even if a caller sets `autoRenew=true`
 *      by accident.
 */
export interface RenewalReminderPayload {
  productName: string;
  subscriptionId: string;
  /** ISO date (YYYY-MM-DD) the current subscription expires / auto-renews. */
  renewalDate: string;
  /** Whole-day delta between today and `renewalDate`. Always ≥ 1 in practice. */
  daysUntilRenewal: number;
  /** True only when the subscription is genuinely configured to auto-renew. */
  autoRenewConfirmed: boolean;
  /** Optional pre-formatted price (e.g. "€58.50"). Null when the price is unknown. */
  amountLabel: string | null;
  /** Reminder cadence bucket (e.g. 7, 14, 1). Used by the idempotency key. */
  daysBefore: number;
}

export interface WaitlistPromotedPayload {
  classTitle: string;
  classDate: string;
  startTime: string;
}

export interface BookingReminderPayload {
  classTitle: string;
  classDate: string;
  startTime: string;
  hoursUntilStart: number;
}

export interface BirthdayBenefitAvailablePayload {
  /** e.g. "Free class during your birthday week" */
  benefitDescription: string;
  /** Last day of the birthday window (YYYY-MM-DD) */
  expiresDate: string;
}

export interface EventAnnouncementPayload {
  eventTitle: string;
  eventId: string;
  shortDescription: string;
  dates: string;
  location: string;
}

export interface PaymentConfirmedPayload {
  productName: string;
  subscriptionId: string;
  amountLabel: string | null;
  paymentMethod: string | null;
  /**
   * Optional frozen pricing snapshot. Same semantics as
   * PaymentPendingPayload — used to render a discount breakdown
   * in the confirmation email when applicable.
   */
  originalPriceCents?: number | null;
  discountAmountCents?: number | null;
  finalPriceCents?: number | null;
  appliedDiscountSummary?: string | null;
}

export interface SubscriptionRefundedPayload {
  productName: string;
  subscriptionId: string;
  amountLabel: string | null;
  refundReason: string | null;
  entitlementCancelled: boolean;
}

export interface AdminBroadcastPayload {
  broadcastId: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  /** In-app relative URL for the CTA button */
  ctaUrl?: string | null;
  /** Absolute URL for the CTA in email rendering */
  ctaEmailUrl?: string | null;
  category?: string | null;
}

// ── Discriminated union for all payloads ─────────────────────

export type CommEventPayloadMap = {
  class_cancelled: ClassCancelledPayload;
  payment_pending: PaymentPendingPayload;
  payment_confirmed: PaymentConfirmedPayload;
  subscription_refunded: SubscriptionRefundedPayload;
  renewal_prepared: RenewalPreparedPayload;
  renewal_due_soon: RenewalDueSoonPayload;
  renewal_reminder: RenewalReminderPayload;
  waitlist_promoted: WaitlistPromotedPayload;
  booking_reminder: BookingReminderPayload;
  birthday_benefit_available: BirthdayBenefitAvailablePayload;
  event_announcement: EventAnnouncementPayload;
  admin_broadcast: AdminBroadcastPayload;
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
