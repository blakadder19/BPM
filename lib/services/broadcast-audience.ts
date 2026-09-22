import "server-only";

/**
 * Audience resolution for admin broadcasts.
 *
 * Takes an audience type + optional params and returns the matching
 * student IDs + names. All resolution uses the canonical repos
 * (student, subscription) so it works identically in dev and production.
 */

import {
  getStudentRepo,
  getSubscriptionRepo,
  getSpecialEventRepo,
} from "@/lib/repositories";
import type { AudienceType, AudienceParams } from "@/lib/domain/broadcast-types";
import {
  resolveTicketHolders,
  type TicketHolderRecipient,
  type TicketHolderResolution,
} from "@/lib/domain/event-ticket-holders";

export type { AudienceType, AudienceParams };

/**
 * Phase 17 — a recipient with an email but NO BPM account.
 *
 * Every audience before this one resolved to student ids, and the
 * send pipeline looked the address up from the account. Guest event
 * ticket holders have no account, so their address has to travel
 * with them and they can only receive email.
 */
export interface GuestRecipient {
  email: string;
  name: string;
}

export interface AudienceResult {
  students: { id: string; name: string }[];
  /**
   * Email-only recipients. Empty for every audience except
   * `event_ticket_holders`, so existing audiences are unaffected.
   */
  guests: GuestRecipient[];
  /**
   * Populated only for `event_ticket_holders`. Drives the recipient
   * preview table and the audit metadata written at send time.
   */
  ticketHolders?: {
    eventId: string;
    eventName: string;
    eventDate: string | null;
    recipients: TicketHolderRecipient[];
    stats: Omit<TicketHolderResolution, "recipients">;
  };
}

/** Total people this audience will reach across both channels. */
export function audienceTotal(result: AudienceResult): number {
  return result.students.length + result.guests.length;
}

const EMPTY: AudienceResult = { students: [], guests: [] };

export async function resolveAudience(
  audienceType: AudienceType,
  params: AudienceParams = {}
): Promise<AudienceResult> {
  const allStudents = await getStudentRepo().getAll();
  const activeStudents = allStudents.filter((s) => s.isActive);

  if (audienceType === "specific_students") {
    const idSet = new Set(params.studentIds ?? []);
    if (idSet.size === 0) return EMPTY;
    return {
      guests: [],
      students: activeStudents
        .filter((s) => idSet.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "all_students") {
    return {
      guests: [],
      students: activeStudents.map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  // ── Phase 17: event ticket holders ────────────────────────
  //
  // The only audience resolved from PURCHASES rather than
  // subscriptions, and the only one that can produce recipients with
  // no BPM account.
  //
  // Note it deliberately does NOT filter on `isActive` the way the
  // student audiences do: someone who bought a ticket and later
  // deactivated their account still needs to hear that the event was
  // cancelled.
  if (audienceType === "event_ticket_holders") {
    const eventId = params.eventId;
    if (!eventId) return EMPTY;

    const repo = getSpecialEventRepo();
    const [event, purchases] = await Promise.all([
      repo.getEventById(eventId),
      repo.getPurchasesByEvent(eventId),
    ]);
    if (!event) return EMPTY;

    // Prefer the linked account's email over the address captured on
    // the purchase row — that is the one the student maintains.
    const studentContacts = new Map(
      allStudents.map((s) => [
        s.id,
        { email: s.email ?? null, name: s.fullName ?? null },
      ]),
    );

    const resolution = resolveTicketHolders({
      purchases,
      studentContacts,
      statusFilter: params.ticketHolderStatus ?? "all",
    });
    const { recipients, ...stats } = resolution;

    return {
      // Linked students can receive both channels.
      students: recipients
        .filter((r) => !r.isGuest && r.studentId)
        .map((r) => ({ id: r.studentId as string, name: r.name })),
      // Guests are email-only.
      guests: recipients
        .filter((r) => r.isGuest)
        .map((r) => ({ email: r.email, name: r.name })),
      ticketHolders: {
        eventId,
        eventName: event.title,
        eventDate: event.startDate ?? null,
        recipients,
        stats,
      },
    };
  }

  const allSubs = await getSubscriptionRepo().getAll();

  if (audienceType === "with_active_subscription") {
    const idsWithActive = new Set(
      allSubs.filter((s) => s.status === "active").map((s) => s.studentId)
    );
    return {
      guests: [],
      students: activeStudents
        .filter((s) => idsWithActive.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "with_pending_payment") {
    const idsWithPending = new Set(
      allSubs
        .filter((s) => s.status === "active" && s.paymentStatus === "pending")
        .map((s) => s.studentId)
    );
    return {
      guests: [],
      students: activeStudents
        .filter((s) => idsWithPending.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "with_membership") {
    const idsWithMembership = new Set(
      allSubs
        .filter(
          (s) =>
            s.status === "active" &&
            s.totalCredits === null
        )
        .map((s) => s.studentId)
    );
    return {
      guests: [],
      students: activeStudents
        .filter((s) => idsWithMembership.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "with_pass") {
    const idsWithPass = new Set(
      allSubs
        .filter(
          (s) =>
            s.status === "active" &&
            s.totalCredits !== null &&
            (s.remainingCredits ?? 0) > 0
        )
        .map((s) => s.studentId)
    );
    return {
      guests: [],
      students: activeStudents
        .filter((s) => idsWithPass.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  if (audienceType === "without_subscription") {
    const idsWithAnySub = new Set(
      allSubs.filter((s) => s.status === "active").map((s) => s.studentId)
    );
    return {
      guests: [],
      students: activeStudents
        .filter((s) => !idsWithAnySub.has(s.id))
        .map((s) => ({ id: s.id, name: s.fullName })),
    };
  }

  return EMPTY;
}

export { AUDIENCE_LABELS } from "@/lib/domain/broadcast-types";
