/**
 * Phase 17 — resolve the ticket holders for a single event.
 *
 * Powers the "Event ticket holders" broadcast audience, whose primary
 * use case is an URGENT operational email: the event was cancelled,
 * the venue moved, the schedule shifted, refunds are being processed.
 *
 * That framing drives two decisions that would otherwise look odd:
 *
 *   1. REFUNDED purchasers are included by default. They are exactly
 *      the people a cancellation email needs to reach — excluding
 *      them would mean the customers most affected never hear from
 *      BPM.
 *   2. Guests are first-class recipients. A large share of event
 *      tickets are bought through guest checkout with no account, so
 *      an audience that only covered linked students would silently
 *      miss most of the room.
 *
 * Pure: no IO. The caller loads the purchases; this module decides
 * who counts and collapses them into unique recipients.
 */

import type { MockEventPurchase } from "@/lib/mock-data";

// ── Status policy ────────────────────────────────────────────

/**
 * `EventPaymentStatus` is `pending | paid | refunded`.
 *
 *   paid     — a real ticket holder. Also covers comped/€0
 *              registrations, which are written as
 *              `paymentMethod: "manual", paymentStatus: "paid"`
 *              with a `comp:` reference, and partially refunded
 *              rows, which stay `paid` with `refundedAmountCents > 0`.
 *   refunded — a former ticket holder. INCLUDED by default (see above).
 *   pending  — registered but never paid: a pay-at-reception row that
 *              was abandoned, or an unfinished checkout. EXCLUDED,
 *              because these are not confirmed ticket holders.
 *
 * `pending` exclusions are counted and surfaced to the admin rather
 * than silently dropped, so she can decide whether to chase them
 * separately.
 */
export const INCLUDED_TICKET_STATUSES = ["paid", "refunded"] as const;

/**
 * Optional narrowing offered in the UI. `all` is the default because
 * it is the safe choice for cancellation communications.
 */
export type TicketHolderStatusFilter = "all" | "paid_only" | "refunded_only";

export const TICKET_HOLDER_FILTER_LABELS: Record<TicketHolderStatusFilter, string> = {
  all: "All ticket holders",
  paid_only: "Paid / confirmed only",
  refunded_only: "Refunded only",
};

// ── Recipient shape ──────────────────────────────────────────

export interface TicketHolderRecipient {
  /** Lower-cased address used for dedup and delivery. */
  email: string;
  /** Best available display name. Falls back to "Guest". */
  name: string;
  /** Null for guest purchases — drives email-only delivery. */
  studentId: string | null;
  /** True when this recipient has no linked account. */
  isGuest: boolean;
  /**
   * Status of the purchase this recipient was resolved from. When one
   * person holds several tickets, the "strongest" status wins
   * (paid beats refunded) so a partial refunder isn't labelled as
   * fully refunded.
   */
  paymentStatus: MockEventPurchase["paymentStatus"];
  /** How many matching purchases collapsed into this recipient. */
  purchaseCount: number;
}

export interface TicketHolderResolution {
  recipients: TicketHolderRecipient[];
  /** Unique recipient count — what the UI shows. */
  totalRecipients: number;
  linkedStudentCount: number;
  guestCount: number;
  /** Purchases skipped because they were never paid. */
  excludedUnpaidCount: number;
  /** Purchases skipped because they carried no usable email. */
  excludedNoEmailCount: number;
  /** Purchases collapsed away as duplicate addresses. */
  duplicatesCollapsed: number;
}

// ── Email extraction ─────────────────────────────────────────

/**
 * Minimal sanity check. Deliberately permissive — the email provider
 * is the real authority on deliverability, and rejecting anything
 * with an unusual-but-valid address would silently drop a genuine
 * ticket holder from a cancellation email.
 */
function isUsableEmail(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim();
  if (v.length < 3) return false;
  const at = v.indexOf("@");
  // Needs an @ with something either side, and no whitespace.
  return at > 0 && at < v.length - 1 && !/\s/.test(v);
}

function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * "paid" outranks "refunded" so that someone holding two tickets —
 * one refunded, one still live — is reported as a paid holder.
 */
function strongerStatus(
  a: MockEventPurchase["paymentStatus"],
  b: MockEventPurchase["paymentStatus"],
): MockEventPurchase["paymentStatus"] {
  if (a === "paid" || b === "paid") return "paid";
  return a === "refunded" || b === "refunded" ? "refunded" : a;
}

// ── Resolver ─────────────────────────────────────────────────

export interface ResolveTicketHoldersInput {
  /** Purchases for ONE event. Caller filters by eventId. */
  purchases: MockEventPurchase[];
  /**
   * Email + name for linked students, keyed by studentId. Supplied by
   * the caller because this module does no IO. A student whose
   * account has no email falls back to the email captured on the
   * purchase row, if any.
   */
  studentContacts?: Map<string, { email: string | null; name: string | null }>;
  statusFilter?: TicketHolderStatusFilter;
}

export function resolveTicketHolders(
  input: ResolveTicketHoldersInput,
): TicketHolderResolution {
  const filter = input.statusFilter ?? "all";
  const contacts = input.studentContacts ?? new Map();

  let excludedUnpaidCount = 0;
  let excludedNoEmailCount = 0;
  let matchedPurchases = 0;

  const byEmail = new Map<string, TicketHolderRecipient>();

  for (const p of input.purchases) {
    // ── Status gate ──
    if (!INCLUDED_TICKET_STATUSES.includes(p.paymentStatus as "paid" | "refunded")) {
      excludedUnpaidCount++;
      continue;
    }
    if (filter === "paid_only" && p.paymentStatus !== "paid") continue;
    if (filter === "refunded_only" && p.paymentStatus !== "refunded") continue;

    // ── Contact resolution ──
    // Prefer the linked account's email (it is the address the
    // student actually signs in with and keeps current); fall back to
    // whatever was captured at purchase time.
    const contact = p.studentId ? contacts.get(p.studentId) : undefined;
    const rawEmail = contact?.email ?? p.guestEmail ?? null;

    if (!isUsableEmail(rawEmail)) {
      excludedNoEmailCount++;
      continue;
    }

    matchedPurchases++;
    const email = normaliseEmail(rawEmail!);
    const name = contact?.name?.trim() || p.guestName?.trim() || "Guest";

    const existing = byEmail.get(email);
    if (existing) {
      existing.purchaseCount++;
      existing.paymentStatus = strongerStatus(existing.paymentStatus, p.paymentStatus);
      // If any of this person's purchases is linked to an account,
      // treat them as a student so they also get the in-app copy.
      if (!existing.studentId && p.studentId) {
        existing.studentId = p.studentId;
        existing.isGuest = false;
        if (contact?.name?.trim()) existing.name = contact.name.trim();
      }
      continue;
    }

    byEmail.set(email, {
      email,
      name,
      studentId: p.studentId ?? null,
      isGuest: !p.studentId,
      paymentStatus: p.paymentStatus,
      purchaseCount: 1,
    });
  }

  const recipients = [...byEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name) || a.email.localeCompare(b.email),
  );

  return {
    recipients,
    totalRecipients: recipients.length,
    linkedStudentCount: recipients.filter((r) => !r.isGuest).length,
    guestCount: recipients.filter((r) => r.isGuest).length,
    excludedUnpaidCount,
    excludedNoEmailCount,
    duplicatesCollapsed: matchedPurchases - recipients.length,
  };
}

/** "X unique ticket holders" — the exact copy the brief specifies. */
export function describeTicketHolderCount(total: number): string {
  return `${total} unique ticket holder${total === 1 ? "" : "s"}`;
}
