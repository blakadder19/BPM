import { describe, it, expect } from "vitest";
import type { MockEventPurchase } from "@/lib/mock-data";
import {
  resolveTicketHolders,
  describeTicketHolderCount,
  INCLUDED_TICKET_STATUSES,
} from "@/lib/domain/event-ticket-holders";

const EVENT_ID = "evt-latin-legends-2";

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

const CONTACTS = new Map([
  ["s-1", { email: "ann@example.com", name: "Ann Doe" }],
  ["s-2", { email: "ben@example.com", name: "Ben Roe" }],
]);

// ── Inclusion ────────────────────────────────────────────────

describe("inclusion", () => {
  it("includes an authenticated student purchaser", () => {
    const r = resolveTicketHolders({
      purchases: [purchase({ id: "a", studentId: "s-1", guestEmail: null, guestName: null })],
      studentContacts: CONTACTS,
    });
    expect(r.totalRecipients).toBe(1);
    expect(r.recipients[0]).toMatchObject({
      email: "ann@example.com",
      name: "Ann Doe",
      studentId: "s-1",
      isGuest: false,
    });
    expect(r.linkedStudentCount).toBe(1);
    expect(r.guestCount).toBe(0);
  });

  it("includes a guest purchaser", () => {
    const r = resolveTicketHolders({ purchases: [purchase()] });
    expect(r.totalRecipients).toBe(1);
    expect(r.recipients[0]).toMatchObject({
      email: "guest1@example.com",
      name: "Guest One",
      studentId: null,
      isGuest: true,
    });
    expect(r.guestCount).toBe(1);
  });

  it("includes a REFUNDED purchaser by default — cancellation emails must reach them", () => {
    const r = resolveTicketHolders({
      purchases: [purchase({ paymentStatus: "refunded", refundedAmountCents: 5000 })],
    });
    expect(r.totalRecipients).toBe(1);
    expect(r.recipients[0].paymentStatus).toBe("refunded");
  });

  it("includes a PARTIALLY refunded purchaser (status stays paid)", () => {
    const r = resolveTicketHolders({
      purchases: [purchase({ paymentStatus: "paid", refundedAmountCents: 2000 })],
    });
    expect(r.totalRecipients).toBe(1);
    expect(r.recipients[0].paymentStatus).toBe("paid");
  });

  it("includes a comped / €0 registration", () => {
    // Written by the guest free-registration path as
    // manual + paid with a `comp:` reference.
    const r = resolveTicketHolders({
      purchases: [
        purchase({
          paymentMethod: "manual",
          paymentStatus: "paid",
          paymentReference: "comp:abc-123",
          paidAmountCents: 0,
          originalAmountCents: 0,
        }),
      ],
    });
    expect(r.totalRecipients).toBe(1);
  });

  it("includes both students and guests together", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "a", studentId: "s-1", guestEmail: null, guestName: null }),
        purchase({ id: "b", guestEmail: "guest2@example.com", guestName: "Guest Two" }),
      ],
      studentContacts: CONTACTS,
    });
    expect(r.totalRecipients).toBe(2);
    expect(r.linkedStudentCount).toBe(1);
    expect(r.guestCount).toBe(1);
  });

  it("documents the included statuses", () => {
    expect([...INCLUDED_TICKET_STATUSES]).toEqual(["paid", "refunded"]);
  });
});

// ── Exclusion ────────────────────────────────────────────────

describe("exclusion", () => {
  it("excludes an unpaid / pending purchase and counts it", () => {
    const r = resolveTicketHolders({
      purchases: [purchase({ paymentStatus: "pending", paidAt: null, paidAmountCents: 0 })],
    });
    expect(r.totalRecipients).toBe(0);
    expect(r.excludedUnpaidCount).toBe(1);
  });

  it("excludes a row with no usable email and counts it", () => {
    const r = resolveTicketHolders({
      purchases: [purchase({ guestEmail: null, guestName: "Walk-in" })],
    });
    expect(r.totalRecipients).toBe(0);
    expect(r.excludedNoEmailCount).toBe(1);
  });

  it.each(["", "   ", "not-an-email", "@nodomain.com", "nolocal@", "has space@x.com"])(
    "rejects malformed email %p",
    (bad) => {
      const r = resolveTicketHolders({ purchases: [purchase({ guestEmail: bad })] });
      expect(r.totalRecipients).toBe(0);
      expect(r.excludedNoEmailCount).toBe(1);
    },
  );

  it("excludes a student purchase whose account and row both lack an email", () => {
    const r = resolveTicketHolders({
      purchases: [purchase({ studentId: "s-9", guestEmail: null })],
      studentContacts: new Map([["s-9", { email: null, name: "No Email" }]]),
    });
    expect(r.totalRecipients).toBe(0);
    expect(r.excludedNoEmailCount).toBe(1);
  });

  it("keeps unpaid and no-email exclusions in separate counters", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "a", paymentStatus: "pending" }),
        purchase({ id: "b", guestEmail: null }),
        purchase({ id: "c", guestEmail: "ok@example.com" }),
      ],
    });
    expect(r.excludedUnpaidCount).toBe(1);
    expect(r.excludedNoEmailCount).toBe(1);
    expect(r.totalRecipients).toBe(1);
  });
});

// ── Deduplication ────────────────────────────────────────────

describe("deduplication", () => {
  it("dedupes the same email case-insensitively", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "a", guestEmail: "Zaria@Example.COM" }),
        purchase({ id: "b", guestEmail: "zaria@example.com" }),
        purchase({ id: "c", guestEmail: "  ZARIA@EXAMPLE.COM  " }),
      ],
    });
    expect(r.totalRecipients).toBe(1);
    expect(r.recipients[0].email).toBe("zaria@example.com");
    expect(r.recipients[0].purchaseCount).toBe(3);
    expect(r.duplicatesCollapsed).toBe(2);
  });

  it("dedupes a student who also bought as a guest with the same address", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "a", guestEmail: "ANN@example.com", guestName: "Ann" }),
        purchase({ id: "b", studentId: "s-1", guestEmail: null, guestName: null }),
      ],
      studentContacts: CONTACTS,
    });
    expect(r.totalRecipients).toBe(1);
    // The linked account wins, so they also get the in-app copy.
    expect(r.recipients[0].studentId).toBe("s-1");
    expect(r.recipients[0].isGuest).toBe(false);
    expect(r.recipients[0].name).toBe("Ann Doe");
  });

  it("paid outranks refunded when one person holds two tickets", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "a", paymentStatus: "refunded" }),
        purchase({ id: "b", paymentStatus: "paid" }),
      ],
    });
    expect(r.totalRecipients).toBe(1);
    expect(r.recipients[0].paymentStatus).toBe("paid");
  });

  it("does not merge different addresses", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "a", guestEmail: "one@example.com" }),
        purchase({ id: "b", guestEmail: "two@example.com" }),
      ],
    });
    expect(r.totalRecipients).toBe(2);
    expect(r.duplicatesCollapsed).toBe(0);
  });
});

// ── Status filters ───────────────────────────────────────────

describe("status filters", () => {
  const mixed = [
    purchase({ id: "a", guestEmail: "paid@example.com", paymentStatus: "paid" }),
    purchase({ id: "b", guestEmail: "refunded@example.com", paymentStatus: "refunded" }),
    purchase({ id: "c", guestEmail: "pending@example.com", paymentStatus: "pending" }),
  ];

  it("'all' (default) includes paid + refunded, never pending", () => {
    const r = resolveTicketHolders({ purchases: mixed });
    expect(r.recipients.map((x) => x.email).sort()).toEqual([
      "paid@example.com",
      "refunded@example.com",
    ]);
  });

  it("'paid_only' excludes refunded", () => {
    const r = resolveTicketHolders({ purchases: mixed, statusFilter: "paid_only" });
    expect(r.recipients.map((x) => x.email)).toEqual(["paid@example.com"]);
  });

  it("'refunded_only' returns just the refunded holders", () => {
    const r = resolveTicketHolders({ purchases: mixed, statusFilter: "refunded_only" });
    expect(r.recipients.map((x) => x.email)).toEqual(["refunded@example.com"]);
  });

  it("every filter still excludes pending", () => {
    for (const f of ["all", "paid_only", "refunded_only"] as const) {
      const r = resolveTicketHolders({ purchases: mixed, statusFilter: f });
      expect(r.recipients.some((x) => x.email === "pending@example.com")).toBe(false);
    }
  });
});

// ── Counts and copy ──────────────────────────────────────────

describe("counts", () => {
  it("reports an accurate unique recipient count for a realistic mix", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "1", studentId: "s-1", guestEmail: null, guestName: null }),
        purchase({ id: "2", studentId: "s-2", guestEmail: null, guestName: null }),
        purchase({ id: "3", guestEmail: "g1@example.com" }),
        purchase({ id: "4", guestEmail: "G1@EXAMPLE.COM" }), // dup
        purchase({ id: "5", guestEmail: "g2@example.com", paymentStatus: "refunded" }),
        purchase({ id: "6", guestEmail: "g3@example.com", paymentStatus: "pending" }), // excluded
        purchase({ id: "7", guestEmail: null }), // excluded
      ],
      studentContacts: CONTACTS,
    });
    expect(r.totalRecipients).toBe(4); // ann, ben, g1, g2
    expect(r.linkedStudentCount).toBe(2);
    expect(r.guestCount).toBe(2);
    expect(r.excludedUnpaidCount).toBe(1);
    expect(r.excludedNoEmailCount).toBe(1);
    expect(r.duplicatesCollapsed).toBe(1);
  });

  it("handles an empty purchase list", () => {
    const r = resolveTicketHolders({ purchases: [] });
    expect(r.totalRecipients).toBe(0);
    expect(r.recipients).toEqual([]);
  });

  it("sorts recipients by name then email for a stable preview", () => {
    const r = resolveTicketHolders({
      purchases: [
        purchase({ id: "a", guestEmail: "z@example.com", guestName: "Zoe" }),
        purchase({ id: "b", guestEmail: "a@example.com", guestName: "Adam" }),
      ],
    });
    expect(r.recipients.map((x) => x.name)).toEqual(["Adam", "Zoe"]);
  });
});

describe("describeTicketHolderCount", () => {
  it("pluralises correctly", () => {
    expect(describeTicketHolderCount(0)).toBe("0 unique ticket holders");
    expect(describeTicketHolderCount(1)).toBe("1 unique ticket holder");
    expect(describeTicketHolderCount(42)).toBe("42 unique ticket holders");
  });
});
