/**
 * Shared types and labels for admin broadcasts.
 * Safe to import from both server and client code.
 */

import type { TicketHolderStatusFilter } from "./event-ticket-holders";

export type AudienceType =
  | "all_students"
  | "specific_students"
  | "with_active_subscription"
  | "with_pending_payment"
  | "with_membership"
  | "with_pass"
  | "without_subscription"
  /**
   * Phase 17 — everyone who bought or registered for a ticket to one
   * event, including guest checkouts. The only audience that can
   * contain recipients without a BPM account.
   */
  | "event_ticket_holders";

export interface AudienceParams {
  studentIds?: string[];
  /** Required for `event_ticket_holders`. */
  eventId?: string;
  /** Optional narrowing for `event_ticket_holders`. Defaults to "all". */
  ticketHolderStatus?: TicketHolderStatusFilter;
}

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  all_students: "All active students",
  specific_students: "Specific students",
  with_active_subscription: "Students with active subscription",
  with_pending_payment: "Students with pending payment",
  with_membership: "Students with membership (unlimited)",
  with_pass: "Students with class pass (credits)",
  without_subscription: "Students without any active subscription",
  event_ticket_holders: "Event ticket holders",
};

/** Audiences that can include recipients with no BPM account. */
export function audienceSupportsGuests(audienceType: AudienceType): boolean {
  return audienceType === "event_ticket_holders";
}

export const EVENT_TICKET_HOLDERS_HELPER =
  "Send this broadcast to everyone who purchased or registered for a ticket to the selected event, including guest bookings.";
