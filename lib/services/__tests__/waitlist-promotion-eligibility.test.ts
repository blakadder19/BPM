/**
 * Phase 16.1 — waitlist promotion must validate the entitlement
 * BEFORE creating the confirmed booking.
 *
 * Root cause this guards against: `findPromotionCandidate` selected
 * on role + capacity only, the service immediately wrote a
 * `confirmed` booking, and only afterwards did the action call
 * `consumeEntitlementCredit` — which refused the expired pass. Net
 * effect: a free confirmed class.
 *
 * These tests drive `BookingService` directly with an injected
 * eligibility predicate, which is exactly how the server actions
 * call it (they resolve subscriptions up front via
 * `buildPromotionEligibility` and hand the service a pure lookup).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  BookingService,
  type StoredBooking,
  type StoredWaitlistEntry,
  type ClassSnapshot,
} from "../booking-service";

const CLASS_ID = "bc-1";

function makeClass(over: Partial<ClassSnapshot> = {}): ClassSnapshot {
  return {
    id: CLASS_ID,
    title: "Bachata Improvers",
    classType: "class",
    date: "2026-08-25",
    startTime: "20:00",
    endTime: "21:00",
    status: "open",
    styleName: "Bachata",
    styleId: "ds-1",
    level: "Improvers",
    // Non-partner so role matching does not interfere with the
    // eligibility behaviour under test.
    danceStyleRequiresBalance: false,
    maxCapacity: 1,
    leaderCap: null,
    followerCap: null,
    ...over,
  } as ClassSnapshot;
}

function makeBooking(over: Partial<StoredBooking> = {}): StoredBooking {
  return {
    id: "b-holder",
    bookableClassId: CLASS_ID,
    studentId: "s-holder",
    studentName: "Holder",
    danceRole: null,
    status: "confirmed",
    source: "subscription",
    subscriptionId: "sub-holder",
    subscriptionName: "Pass",
    adminNote: null,
    bookedAt: "2026-08-20T10:00:00.000Z",
    cancelledAt: null,
    checkInToken: "tok-holder",
    ...over,
  } as StoredBooking;
}

function makeWaitlistEntry(over: Partial<StoredWaitlistEntry> = {}): StoredWaitlistEntry {
  return {
    id: "wl-1",
    bookableClassId: CLASS_ID,
    studentId: "s-1",
    studentName: "Ann",
    danceRole: null,
    position: 1,
    status: "waiting",
    subscriptionId: "sub-1",
    subscriptionName: "Silver Class Pass",
    joinedAt: "2026-08-21T10:00:00.000Z",
    promotedAt: null,
    ...over,
  } as StoredWaitlistEntry;
}

/** Eligibility lookup keyed by subscription id, like the real one. */
function eligibility(usableBySubId: Record<string, boolean>) {
  return (entry: StoredWaitlistEntry) => {
    if (!entry.subscriptionId) return true;
    return usableBySubId[entry.subscriptionId] ?? false;
  };
}

function confirmedFor(svc: BookingService, studentId: string) {
  return svc.bookings.filter(
    (b) => b.studentId === studentId && b.status === "confirmed",
  );
}

describe("waitlist promotion — entitlement gate", () => {
  let svc: BookingService;

  beforeEach(() => {
    svc = new BookingService([makeBooking()], [makeWaitlistEntry()], [makeClass()]);
  });

  it("valid entitlement → promoted, and the credit is consumable", () => {
    const result = svc.cancelBooking(
      "b-holder",
      new Date("2026-08-21T12:00:00Z"),
      eligibility({ "sub-1": true }),
    );

    expect(result.type).toBe("cancelled");
    if (result.type !== "cancelled") return;
    expect(result.promoted).not.toBeNull();
    expect(result.promoted!.waitlistId).toBe("wl-1");
    // The subscription id is handed back so the caller can charge it.
    expect(result.promoted!.subscriptionId).toBe("sub-1");
    expect(result.skippedIneligible).toEqual([]);
    expect(confirmedFor(svc, "s-1")).toHaveLength(1);
  });

  it("expired entitlement → NOT promoted and no confirmed booking is created", () => {
    const result = svc.cancelBooking(
      "b-holder",
      new Date("2026-08-21T12:00:00Z"),
      eligibility({ "sub-1": false }),
    );

    expect(result.type).toBe("cancelled");
    if (result.type !== "cancelled") return;
    expect(result.promoted).toBeNull();
    // No free class.
    expect(confirmedFor(svc, "s-1")).toHaveLength(0);
    // Reported for admin follow-up rather than lost.
    expect(result.skippedIneligible).toEqual([
      { waitlistId: "wl-1", studentId: "s-1", studentName: "Ann" },
    ]);
  });

  it("a skipped student stays on the waitlist in 'waiting' status", () => {
    svc.cancelBooking(
      "b-holder",
      new Date("2026-08-21T12:00:00Z"),
      eligibility({ "sub-1": false }),
    );
    const entry = svc.waitlist.find((w) => w.id === "wl-1");
    expect(entry!.status).toBe("waiting");
    expect(entry!.promotedAt).toBeNull();
  });

  it("lapsed-but-status-active entitlement → not promoted", () => {
    // The predicate is what the real caller derives from
    // `isSubscriptionUsable`, which refuses a row whose validUntil
    // has passed regardless of its stored status. Modelled here as
    // the predicate simply returning false.
    const result = svc.cancelBooking(
      "b-holder",
      new Date("2026-08-21T12:00:00Z"),
      eligibility({ "sub-1": false }),
    );
    if (result.type !== "cancelled") throw new Error("expected cancel");
    expect(result.promoted).toBeNull();
    expect(confirmedFor(svc, "s-1")).toHaveLength(0);
  });

  it("promotes the NEXT eligible candidate when the first has lapsed", () => {
    svc = new BookingService(
      [makeBooking()],
      [
        makeWaitlistEntry({ id: "wl-1", studentId: "s-1", studentName: "Ann", position: 1, subscriptionId: "sub-1" }),
        makeWaitlistEntry({ id: "wl-2", studentId: "s-2", studentName: "Ben", position: 2, subscriptionId: "sub-2" }),
      ],
      [makeClass()],
    );

    const result = svc.cancelBooking(
      "b-holder",
      new Date("2026-08-21T12:00:00Z"),
      eligibility({ "sub-1": false, "sub-2": true }),
    );

    if (result.type !== "cancelled") throw new Error("expected cancel");
    // Ben jumps Ann because Ann's pass lapsed.
    expect(result.promoted!.waitlistId).toBe("wl-2");
    expect(result.promoted!.subscriptionId).toBe("sub-2");
    expect(confirmedFor(svc, "s-2")).toHaveLength(1);
    expect(confirmedFor(svc, "s-1")).toHaveLength(0);
    // Ann is reported as skipped and remains waiting.
    expect(result.skippedIneligible).toEqual([
      { waitlistId: "wl-1", studentId: "s-1", studentName: "Ann" },
    ]);
    expect(svc.waitlist.find((w) => w.id === "wl-1")!.status).toBe("waiting");
  });

  it("promotes nobody when every candidate has lapsed, and reports all of them", () => {
    svc = new BookingService(
      [makeBooking()],
      [
        makeWaitlistEntry({ id: "wl-1", studentId: "s-1", studentName: "Ann", position: 1, subscriptionId: "sub-1" }),
        makeWaitlistEntry({ id: "wl-2", studentId: "s-2", studentName: "Ben", position: 2, subscriptionId: "sub-2" }),
      ],
      [makeClass()],
    );

    const result = svc.cancelBooking(
      "b-holder",
      new Date("2026-08-21T12:00:00Z"),
      eligibility({ "sub-1": false, "sub-2": false }),
    );

    if (result.type !== "cancelled") throw new Error("expected cancel");
    expect(result.promoted).toBeNull();
    expect(result.skippedIneligible).toHaveLength(2);
    expect(result.skippedIneligible!.map((s) => s.studentName)).toEqual(["Ann", "Ben"]);
    expect(svc.bookings.filter((b) => b.status === "confirmed")).toHaveLength(0);
  });

  it("entries with no subscription (comp/admin) are still promotable", () => {
    svc = new BookingService(
      [makeBooking()],
      [makeWaitlistEntry({ subscriptionId: null, subscriptionName: null })],
      [makeClass()],
    );

    const result = svc.cancelBooking(
      "b-holder",
      new Date("2026-08-21T12:00:00Z"),
      eligibility({}),
    );

    if (result.type !== "cancelled") throw new Error("expected cancel");
    expect(result.promoted).not.toBeNull();
    expect(result.promoted!.subscriptionId).toBeNull();
  });

  it("omitting the predicate preserves the pre-16.1 behaviour", () => {
    const result = svc.cancelBooking("b-holder", new Date("2026-08-21T12:00:00Z"));
    if (result.type !== "cancelled") throw new Error("expected cancel");
    expect(result.promoted).not.toBeNull();
    expect(result.skippedIneligible).toEqual([]);
  });
});

describe("waitlist promotion — admin cancel path", () => {
  it("applies the same gate as the student cancel path", () => {
    const svc = new BookingService(
      [makeBooking()],
      [makeWaitlistEntry()],
      [makeClass()],
    );

    const result = svc.cancelBookingAsAdmin("b-holder", false, eligibility({ "sub-1": false }));

    if (result.type !== "cancelled") throw new Error("expected cancel");
    expect(result.promoted).toBeNull();
    expect(confirmedFor(svc, "s-1")).toHaveLength(0);
    expect(result.skippedIneligible).toHaveLength(1);
  });

  it("promotes the next eligible candidate on the admin path too", () => {
    const svc = new BookingService(
      [makeBooking()],
      [
        makeWaitlistEntry({ id: "wl-1", studentId: "s-1", studentName: "Ann", position: 1, subscriptionId: "sub-1" }),
        makeWaitlistEntry({ id: "wl-2", studentId: "s-2", studentName: "Ben", position: 2, subscriptionId: "sub-2" }),
      ],
      [makeClass()],
    );

    const result = svc.cancelBookingAsAdmin(
      "b-holder",
      true,
      eligibility({ "sub-1": false, "sub-2": true }),
    );

    if (result.type !== "cancelled") throw new Error("expected cancel");
    expect(result.promoted!.waitlistId).toBe("wl-2");
  });
});

describe("waitlist promotion — direct admin promote", () => {
  let svc: BookingService;

  beforeEach(() => {
    svc = new BookingService([], [makeWaitlistEntry()], [makeClass()]);
  });

  it("promotes when the entitlement is usable", () => {
    const result = svc.promoteFromWaitlist("wl-1", eligibility({ "sub-1": true }));
    expect(result.type).toBe("promoted");
    expect(confirmedFor(svc, "s-1")).toHaveLength(1);
  });

  it("refuses with a clear error when the entitlement has lapsed", () => {
    const result = svc.promoteFromWaitlist("wl-1", eligibility({ "sub-1": false }));
    expect(result.type).toBe("error");
    if (result.type !== "error") return;
    expect(result.reason).toContain("Ann");
    expect(result.reason).toMatch(/no longer has a usable entitlement/i);
    // No booking, and the entry is untouched so the admin can retry
    // after renewing the student's pass.
    expect(confirmedFor(svc, "s-1")).toHaveLength(0);
    expect(svc.waitlist.find((w) => w.id === "wl-1")!.status).toBe("waiting");
  });

  it("does not fall through to another student — the admin chose this one", () => {
    svc = new BookingService(
      [],
      [
        makeWaitlistEntry({ id: "wl-1", studentId: "s-1", studentName: "Ann", subscriptionId: "sub-1" }),
        makeWaitlistEntry({ id: "wl-2", studentId: "s-2", studentName: "Ben", position: 2, subscriptionId: "sub-2" }),
      ],
      [makeClass()],
    );

    const result = svc.promoteFromWaitlist(
      "wl-1",
      eligibility({ "sub-1": false, "sub-2": true }),
    );

    expect(result.type).toBe("error");
    expect(svc.bookings.filter((b) => b.status === "confirmed")).toHaveLength(0);
  });
});

// ── The invariant the whole phase exists to protect ─────────

describe("invariant: no confirmed booking without a valid entitlement", () => {
  it("holds across every promotion entry point", () => {
    const paths: Array<(svc: BookingService) => void> = [
      (s) => s.cancelBooking("b-holder", new Date("2026-08-21T12:00:00Z"), eligibility({ "sub-1": false })),
      (s) => s.cancelBookingAsAdmin("b-holder", false, eligibility({ "sub-1": false })),
      (s) => s.promoteFromWaitlist("wl-1", eligibility({ "sub-1": false })),
    ];

    for (const run of paths) {
      const svc = new BookingService([makeBooking()], [makeWaitlistEntry()], [makeClass()]);
      run(svc);
      const confirmed = svc.bookings.filter(
        (b) => b.status === "confirmed" && b.source === "waitlist_promotion",
      );
      expect(confirmed).toHaveLength(0);
    }
  });
});
