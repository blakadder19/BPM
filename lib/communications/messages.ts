/**
 * Message builders for each communication event type.
 *
 * Each builder produces a structured message with:
 *   - title: short summary for bell/push/email subject
 *   - body: descriptive text for bell panel / email body
 *   - href: optional in-app navigation link
 *
 * These are pure functions with no side effects or DB access.
 */

import { formatTime } from "@/lib/utils";
import type {
  CommEventType,
  CommEventPayloadMap,
  ClassCancelledPayload,
  PaymentPendingPayload,
  RenewalPreparedPayload,
  RenewalDueSoonPayload,
} from "./events";

export interface CommMessage {
  title: string;
  body: string;
  href?: string;
}

type MessageBuilder<T extends CommEventType> = (
  payload: CommEventPayloadMap[T]
) => CommMessage;

// ── Individual builders ──────────────────────────────────────

const buildClassCancelled: MessageBuilder<"class_cancelled"> = (
  p: ClassCancelledPayload
) => ({
  title: "Class cancelled",
  body: `"${p.classTitle}" on ${p.classDate} at ${formatTime(p.startTime)} was cancelled by the academy.${p.creditReverted ? " Your credit has been returned." : ""}`,
  href: "/bookings",
});

const buildPaymentPending: MessageBuilder<"payment_pending"> = (
  p: PaymentPendingPayload
) => ({
  title: "Payment pending",
  body: `Your "${p.productName}"${p.termName ? ` (${p.termName})` : ""} is awaiting payment.${p.amountLabel ? ` Amount: ${p.amountLabel}.` : ""} Please speak to reception or complete payment to activate your plan.`,
  href: "/catalog",
});

const buildRenewalPrepared: MessageBuilder<"renewal_prepared"> = (
  p: RenewalPreparedPayload
) => ({
  title: "Membership renewed",
  body: `Your "${p.productName}" has been renewed for ${p.termName} (${p.validFrom}${p.validUntil ? ` – ${p.validUntil}` : ""}). Payment is pending.`,
  href: "/catalog",
});

const buildRenewalDueSoon: MessageBuilder<"renewal_due_soon"> = (
  p: RenewalDueSoonPayload
) => ({
  title: "Renewal payment due soon",
  body: `Your "${p.productName}" renewal for ${p.termName} starts in ${p.daysUntilStart} day${p.daysUntilStart !== 1 ? "s" : ""}. Please arrange payment to keep your membership active.`,
  href: "/catalog",
});

// ── Registry ─────────────────────────────────────────────────

const BUILDERS: {
  [K in CommEventType]: MessageBuilder<K>;
} = {
  class_cancelled: buildClassCancelled,
  payment_pending: buildPaymentPending,
  renewal_prepared: buildRenewalPrepared,
  renewal_due_soon: buildRenewalDueSoon,
};

/**
 * Build a human-readable message for any communication event.
 * Works for in-app bell notifications and future email channels.
 */
export function buildMessage<T extends CommEventType>(
  type: T,
  payload: CommEventPayloadMap[T]
): CommMessage {
  const builder = BUILDERS[type] as MessageBuilder<T>;
  return builder(payload);
}
