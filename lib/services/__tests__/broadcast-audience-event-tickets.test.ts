/**
 * Phase 17 — service-layer tests for the "Event ticket holders"
 * broadcast audience.
 *
 * `lib/domain/__tests__/event-ticket-holders.test.ts` covers the pure
 * inclusion/dedup rules. This file covers the wiring that the pure
 * tests cannot see:
 *
 *   * students vs guests land in the right buckets, which is what
 *     decides who can receive an in-app notification;
 *   * the account email wins over the address captured at purchase;
 *   * the audit stats travel out on `ticketHolders`;
 *   * existing audiences are unaffected and still return `guests: []`.
 */
import "server-only";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { MockEventPurchase, MockSpecialEvent } from "@/lib/mock-data";
import type { StudentListItem } from "@/types/domain";

vi.mock("server-only", () => ({}));

const EVENT_ID = "evt-latin-legends-2";

let STUDENTS: StudentListItem[] = [];
let PURCHASES: MockEventPurchase[] = [];
let EVENTS: MockSpecialEvent[] = [];

vi.mock("@/lib/repositories", () => ({
  getStudentRepo: () => ({
    async getAll() {
      return STUDENTS;
    },
  }),
  getSubscriptionRepo: () => ({
    async getAll() {
      return [];
    },
  }),
  getSpecialEventRepo: () => ({
    async getEventById(id: string) {
      return EVENTS.find((e) => e.id === id) ?? null;
    },
    async getPurchasesByEvent(eventId: string) {
      return PURCHASES.filter((p) => p.eventId === eventId);
    },
  }),
}));

import { resolveAudience, audienceTotal } from "../broadcast-audience";

function student(over: Partial<StudentListItem> = {}): StudentListItem {
  return {
    id: "s-1",
    fullName: "Ann Doe",
    email: "ann@example.com",
    phone: null,
    preferredRole: null,
    isActive: true,
    joinedAt: "2026-01-01",
    dateOfBirth: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    authLinkedAt: "2026-01-01",
    ...over,
  } as StudentListItem;
}

function event(over: Partial<MockSpecialEvent> = {}): MockSpecialEvent {
  return {
    id: EVENT_ID,
    title: "Latin Legends Vol.2",
    startDate: "2026-10-04",
    status: "published",
    isVisible: true,
    ...over,
  } as MockSpecialEvent;
}

function purchase(over: Partial<MockEventPurchase> = {}): MockEventPurchase {
  return {
    id: "ep-1",
    studentId: null,
    eventProductId: "epx-1",
    eventId: EVENT_ID,
    guestName: "Guest One",
    guestEmail: "guest1@example.com",
    guestPhone: null,
    qrToken: "tok-1",
    paymentMethod: "stripe",
    paymentStatus: "paid",
    paymentReference: "stripe:cs_1",
    receptionMethod: null,
    purchasedAt: "2026-09-01T10:00:00",
    paidAt: "2026-09-01T10:00:00",
    notes: null,
    unitPriceCentsAtPurchase: 5000,
    originalAmountCents: 5000,
    discountAmountCents: 0,
    paidAmountCents: 5000,
    currency: "eur",
    productNameSnapshot: "Weekend Pass",
    productTypeSnapshot: "full_pass",
    appliedDiscount: null,
    checkedInAt: null,
    checkedInBy: null,
    refundedAt: null,
    refundedBy: null,
    refundReason: null,
    stripeRefundId: null,
    refundedAmountCents: 0,
    refundStatus: null,
    lastEmailType: null,
    lastEmailSentAt: null,
    lastEmailSuccess: null,
    subtotalExVatCents: null,
    vatAmountCents: null,
    vatRatePercent: null,
    vatPriceMode: null,
    totalIncVatCents: null,
    ...over,
  } as MockEventPurchase;
}

beforeEach(() => {
  STUDENTS = [];
  PURCHASES = [];
  EVENTS = [event()];
});

// ── Student vs guest bucketing ──────────────────────────────

describe("event_ticket_holders — student vs guest split", () => {
  it("puts a linked student in `students` so they can get in-app too", async () => {
    STUDENTS = [student()];
    PURCHASES = [purchase({ studentId: "s-1", guestEmail: null, guestName: null })];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.students).toEqual([{ id: "s-1", name: "Ann Doe" }]);
    expect(r.guests).toEqual([]);
    expect(audienceTotal(r)).toBe(1);
  });

  it("puts a guest in `guests` with their email, since there is no account to look up", async () => {
    PURCHASES = [purchase()];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.students).toEqual([]);
    expect(r.guests).toEqual([{ email: "guest1@example.com", name: "Guest One" }]);
    expect(audienceTotal(r)).toBe(1);
  });

  it("splits a mixed audience correctly", async () => {
    STUDENTS = [student(), student({ id: "s-2", fullName: "Ben Roe", email: "ben@example.com" })];
    PURCHASES = [
      purchase({ id: "a", studentId: "s-1", guestEmail: null, guestName: null }),
      purchase({ id: "b", studentId: "s-2", guestEmail: null, guestName: null }),
      purchase({ id: "c", guestEmail: "g1@example.com", guestName: "Gee One" }),
    ];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.students).toHaveLength(2);
    expect(r.guests).toHaveLength(1);
    expect(audienceTotal(r)).toBe(3);
    expect(r.ticketHolders!.stats.linkedStudentCount).toBe(2);
    expect(r.ticketHolders!.stats.guestCount).toBe(1);
  });

  it("includes a ticket holder whose account was later DEACTIVATED", async () => {
    // Student audiences filter on isActive; this one must not —
    // a deactivated account still needs the cancellation email.
    STUDENTS = [student({ isActive: false })];
    PURCHASES = [purchase({ studentId: "s-1", guestEmail: null, guestName: null })];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.students).toEqual([{ id: "s-1", name: "Ann Doe" }]);
  });

  it("prefers the account email over the address captured at purchase", async () => {
    STUDENTS = [student({ email: "current@example.com" })];
    PURCHASES = [
      purchase({ studentId: "s-1", guestEmail: "old-typo@example.com", guestName: "Ann" }),
    ];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.ticketHolders!.recipients[0].email).toBe("current@example.com");
  });

  it("falls back to the purchase email when the account has none", async () => {
    STUDENTS = [student({ email: null as unknown as string })];
    PURCHASES = [purchase({ studentId: "s-1", guestEmail: "fallback@example.com" })];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.ticketHolders!.recipients[0].email).toBe("fallback@example.com");
  });
});

// ── Inclusion / exclusion through the service ───────────────

describe("event_ticket_holders — inclusion through the service", () => {
  it("includes refunded purchasers by default", async () => {
    PURCHASES = [
      purchase({ id: "a", guestEmail: "paid@example.com" }),
      purchase({ id: "b", guestEmail: "refunded@example.com", paymentStatus: "refunded" }),
    ];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.guests.map((g) => g.email).sort()).toEqual([
      "paid@example.com",
      "refunded@example.com",
    ]);
  });

  it("excludes unpaid purchases and reports the count", async () => {
    PURCHASES = [
      purchase({ id: "a", guestEmail: "ok@example.com" }),
      purchase({ id: "b", guestEmail: "never-paid@example.com", paymentStatus: "pending" }),
    ];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.guests.map((g) => g.email)).toEqual(["ok@example.com"]);
    expect(r.ticketHolders!.stats.excludedUnpaidCount).toBe(1);
  });

  it("dedupes case-insensitively across purchases", async () => {
    PURCHASES = [
      purchase({ id: "a", guestEmail: "Zaria@Example.com" }),
      purchase({ id: "b", guestEmail: "zaria@example.com" }),
    ];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(audienceTotal(r)).toBe(1);
    expect(r.ticketHolders!.stats.duplicatesCollapsed).toBe(1);
  });

  it("honours the paid_only filter", async () => {
    PURCHASES = [
      purchase({ id: "a", guestEmail: "paid@example.com" }),
      purchase({ id: "b", guestEmail: "refunded@example.com", paymentStatus: "refunded" }),
    ];

    const r = await resolveAudience("event_ticket_holders", {
      eventId: EVENT_ID,
      ticketHolderStatus: "paid_only",
    });

    expect(r.guests.map((g) => g.email)).toEqual(["paid@example.com"]);
  });

  it("honours the refunded_only filter", async () => {
    PURCHASES = [
      purchase({ id: "a", guestEmail: "paid@example.com" }),
      purchase({ id: "b", guestEmail: "refunded@example.com", paymentStatus: "refunded" }),
    ];

    const r = await resolveAudience("event_ticket_holders", {
      eventId: EVENT_ID,
      ticketHolderStatus: "refunded_only",
    });

    expect(r.guests.map((g) => g.email)).toEqual(["refunded@example.com"]);
  });

  it("only considers purchases for the SELECTED event", async () => {
    EVENTS = [event(), event({ id: "evt-other", title: "Other Event" })];
    PURCHASES = [
      purchase({ id: "a", guestEmail: "ours@example.com", eventId: EVENT_ID }),
      purchase({ id: "b", guestEmail: "theirs@example.com", eventId: "evt-other" }),
    ];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.guests.map((g) => g.email)).toEqual(["ours@example.com"]);
  });
});

// ── Audit metadata ──────────────────────────────────────────

describe("event_ticket_holders — audit metadata", () => {
  it("carries the event identity and resolved stats for the send summary", async () => {
    STUDENTS = [student()];
    PURCHASES = [
      purchase({ id: "a", studentId: "s-1", guestEmail: null, guestName: null }),
      purchase({ id: "b", guestEmail: "g@example.com" }),
      purchase({ id: "c", guestEmail: "pending@example.com", paymentStatus: "pending" }),
      purchase({ id: "d", guestEmail: null }),
    ];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.ticketHolders).toMatchObject({
      eventId: EVENT_ID,
      eventName: "Latin Legends Vol.2",
      eventDate: "2026-10-04",
    });
    expect(r.ticketHolders!.stats).toMatchObject({
      totalRecipients: 2,
      linkedStudentCount: 1,
      guestCount: 1,
      excludedUnpaidCount: 1,
      excludedNoEmailCount: 1,
    });
  });

  it("includes the full recipient list for the preview table", async () => {
    PURCHASES = [purchase({ guestEmail: "g@example.com", guestName: "Gee" })];

    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });

    expect(r.ticketHolders!.recipients).toEqual([
      {
        email: "g@example.com",
        name: "Gee",
        studentId: null,
        isGuest: true,
        paymentStatus: "paid",
        purchaseCount: 1,
      },
    ]);
  });
});

// ── Guard rails ─────────────────────────────────────────────

describe("event_ticket_holders — guard rails", () => {
  it("returns an empty audience when no event is supplied", async () => {
    PURCHASES = [purchase()];
    const r = await resolveAudience("event_ticket_holders", {});
    expect(audienceTotal(r)).toBe(0);
    expect(r.ticketHolders).toBeUndefined();
  });

  it("returns an empty audience for an unknown event", async () => {
    const r = await resolveAudience("event_ticket_holders", { eventId: "evt-nope" });
    expect(audienceTotal(r)).toBe(0);
  });

  it("returns an empty audience for an event with no purchases", async () => {
    const r = await resolveAudience("event_ticket_holders", { eventId: EVENT_ID });
    expect(audienceTotal(r)).toBe(0);
    expect(r.ticketHolders!.stats.totalRecipients).toBe(0);
  });
});

// ── Existing audiences unchanged ────────────────────────────

describe("existing audiences are unaffected", () => {
  beforeEach(() => {
    STUDENTS = [
      student(),
      student({ id: "s-2", fullName: "Ben Roe", email: "ben@example.com" }),
      student({ id: "s-3", fullName: "Inactive", isActive: false }),
    ];
  });

  it("all_students still returns active students and no guests", async () => {
    const r = await resolveAudience("all_students");
    expect(r.students).toHaveLength(2);
    expect(r.guests).toEqual([]);
    expect(r.ticketHolders).toBeUndefined();
  });

  it("specific_students still filters by id and returns no guests", async () => {
    const r = await resolveAudience("specific_students", { studentIds: ["s-2"] });
    expect(r.students).toEqual([{ id: "s-2", name: "Ben Roe" }]);
    expect(r.guests).toEqual([]);
  });

  it("specific_students with no ids returns an empty audience", async () => {
    const r = await resolveAudience("specific_students", { studentIds: [] });
    expect(audienceTotal(r)).toBe(0);
  });

  it("subscription-based audiences still return guests: []", async () => {
    for (const t of [
      "with_active_subscription",
      "with_pending_payment",
      "with_membership",
      "with_pass",
      "without_subscription",
    ] as const) {
      const r = await resolveAudience(t);
      expect(r.guests).toEqual([]);
    }
  });
});
