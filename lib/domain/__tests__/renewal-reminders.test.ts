import { describe, it, expect } from "vitest";
import type { MockSubscription } from "@/lib/mock-data";
import {
  findRenewalReminderCandidates,
  resolveReminderDaysBefore,
  daysBetweenISO,
  isRemindable,
  isAutoRenewConfirmed,
  formatRenewalAmount,
} from "../renewal-reminders";

// ── Test fixtures ───────────────────────────────────────────

function sub(over: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: "sub-test",
    studentId: "stu-test",
    productId: "prod-test",
    productName: "Gold Standard Membership",
    productType: "membership",
    status: "active",
    totalCredits: null,
    remainingCredits: null,
    validFrom: "2026-06-01",
    validUntil: "2026-06-30",
    selectedStyleId: null,
    selectedStyleName: null,
    selectedStyleIds: null,
    selectedStyleNames: null,
    notes: null,
    termId: null,
    paymentMethod: "card",
    paymentStatus: "paid",
    assignedBy: null,
    assignedAt: "2026-05-25T10:00:00",
    autoRenew: true,
    classesUsed: 0,
    classesPerTerm: null,
    renewedFromId: null,
    paidAt: "2026-05-25T10:00:00",
    paymentReference: null,
    paymentNotes: null,
    collectedBy: null,
    priceCentsAtPurchase: 17000,
    currencyAtPurchase: "EUR",
    refundedAt: null,
    refundedBy: null,
    refundReason: null,
    stripeRefundId: null,
    refundedAmountCents: 0,
    refundStatus: null,
    productSnapshot: null,
    originalPriceCents: null,
    discountAmountCents: 0,
    appliedDiscount: null,
    manualDiscountCents: 0,
    manualDiscountReason: null,
    manualDiscountBy: null,
    ...over,
  };
}

// ── daysBetweenISO ──────────────────────────────────────────

describe("daysBetweenISO", () => {
  it("returns 0 for the same day", () => {
    expect(daysBetweenISO("2026-06-15", "2026-06-15")).toBe(0);
  });
  it("returns positive when `to` is later", () => {
    expect(daysBetweenISO("2026-06-15", "2026-06-22")).toBe(7);
  });
  it("returns negative when `to` is earlier", () => {
    expect(daysBetweenISO("2026-06-15", "2026-06-14")).toBe(-1);
  });
  it("returns NaN for invalid dates", () => {
    expect(Number.isNaN(daysBetweenISO("not-a-date", "2026-06-22"))).toBe(true);
  });
});

// ── resolveReminderDaysBefore ───────────────────────────────

describe("resolveReminderDaysBefore", () => {
  it("uses the default 7 when env is unset", () => {
    expect(resolveReminderDaysBefore("")).toEqual([7]);
    expect(resolveReminderDaysBefore(undefined)).toEqual(
      [7]
    );
  });
  it("parses a single positive integer", () => {
    expect(resolveReminderDaysBefore("14")).toEqual([14]);
  });
  it("parses a comma-separated cadence and sorts desc", () => {
    expect(resolveReminderDaysBefore("7,14,1")).toEqual([14, 7, 1]);
  });
  it("dedupes repeated values", () => {
    expect(resolveReminderDaysBefore("7,7,14")).toEqual([14, 7]);
  });
  it("rejects zero / negative / non-numeric", () => {
    expect(resolveReminderDaysBefore("0,-5,abc")).toEqual([7]);
  });
  it("clamps unreasonably large values (>365 ignored)", () => {
    expect(resolveReminderDaysBefore("7,9999")).toEqual([7]);
  });
});

// ── isRemindable / isAutoRenewConfirmed ─────────────────────

describe("isRemindable", () => {
  it("accepts an active, paid, auto-renew sub with validUntil set", () => {
    expect(isRemindable(sub())).toBe(true);
  });
  it("rejects when autoRenew is false", () => {
    expect(isRemindable(sub({ autoRenew: false }))).toBe(false);
  });
  it("rejects when status is not active", () => {
    expect(isRemindable(sub({ status: "expired" }))).toBe(false);
    expect(isRemindable(sub({ status: "paused" }))).toBe(false);
    expect(isRemindable(sub({ status: "cancelled" }))).toBe(false);
  });
  it("rejects when paymentStatus is not paid/complimentary", () => {
    expect(isRemindable(sub({ paymentStatus: "pending" }))).toBe(false);
    expect(isRemindable(sub({ paymentStatus: "refunded" }))).toBe(false);
  });
  it("accepts complimentary (rolling free entitlements)", () => {
    expect(isRemindable(sub({ paymentStatus: "complimentary" }))).toBe(true);
  });
  it("rejects when validUntil is null (drop-in-style, no renewal date)", () => {
    expect(isRemindable(sub({ validUntil: null }))).toBe(false);
  });
});

describe("isAutoRenewConfirmed", () => {
  it("mirrors the autoRenew flag", () => {
    expect(isAutoRenewConfirmed(sub({ autoRenew: true }))).toBe(true);
    expect(isAutoRenewConfirmed(sub({ autoRenew: false }))).toBe(false);
  });
});

// ── findRenewalReminderCandidates ───────────────────────────

describe("findRenewalReminderCandidates", () => {
  it("matches a sub due in exactly N days for cadence [N]", () => {
    const s = sub({ id: "s1", validUntil: "2026-06-22" });
    const result = findRenewalReminderCandidates({
      subscriptions: [s],
      today: "2026-06-15",
      daysBeforeCadence: [7],
    });
    expect(result).toHaveLength(1);
    expect(result[0].subscription.id).toBe("s1");
    expect(result[0].daysBefore).toBe(7);
    expect(result[0].daysUntilRenewal).toBe(7);
    expect(result[0].renewalDate).toBe("2026-06-22");
    expect(result[0].autoRenewConfirmed).toBe(true);
  });

  it("does not match a non-auto-renew sub (acceptance criterion #2)", () => {
    const s = sub({ id: "s2", autoRenew: false, validUntil: "2026-06-22" });
    expect(
      findRenewalReminderCandidates({
        subscriptions: [s],
        today: "2026-06-15",
        daysBeforeCadence: [7],
      }),
    ).toEqual([]);
  });

  it("does not match a sub outside the reminder window", () => {
    const s = sub({ id: "s3", validUntil: "2026-07-15" }); // 30 days out
    expect(
      findRenewalReminderCandidates({
        subscriptions: [s],
        today: "2026-06-15",
        daysBeforeCadence: [7],
      }),
    ).toEqual([]);
  });

  it("does not match a sub whose renewal date is today", () => {
    const s = sub({ id: "s4", validUntil: "2026-06-15" });
    expect(
      findRenewalReminderCandidates({
        subscriptions: [s],
        today: "2026-06-15",
        daysBeforeCadence: [7],
      }),
    ).toEqual([]);
  });

  it("supports multi-cadence — both 14-day and 7-day subs match", () => {
    const sFourteen = sub({ id: "s5", validUntil: "2026-06-29" });
    const sSeven = sub({ id: "s6", validUntil: "2026-06-22" });
    const sOther = sub({ id: "s7", validUntil: "2026-06-25" });
    const result = findRenewalReminderCandidates({
      subscriptions: [sFourteen, sSeven, sOther],
      today: "2026-06-15",
      daysBeforeCadence: [14, 7, 1],
    });
    const ids = result.map((r) => r.subscription.id).sort();
    expect(ids).toEqual(["s5", "s6"]);
    const fourteen = result.find((r) => r.subscription.id === "s5");
    const seven = result.find((r) => r.subscription.id === "s6");
    expect(fourteen?.daysBefore).toBe(14);
    expect(seven?.daysBefore).toBe(7);
  });

  it("excludes expired / non-auto-renew / pending in the same batch", () => {
    const ok = sub({ id: "ok", validUntil: "2026-06-22" });
    const expired = sub({ id: "expired", validUntil: "2026-06-22", status: "expired" });
    const manual = sub({ id: "manual", validUntil: "2026-06-22", autoRenew: false });
    const pending = sub({ id: "pending", validUntil: "2026-06-22", paymentStatus: "pending" });
    const result = findRenewalReminderCandidates({
      subscriptions: [ok, expired, manual, pending],
      today: "2026-06-15",
      daysBeforeCadence: [7],
    });
    expect(result.map((r) => r.subscription.id)).toEqual(["ok"]);
  });

  it("safely handles an empty cadence list", () => {
    const s = sub({ id: "s8", validUntil: "2026-06-22" });
    expect(
      findRenewalReminderCandidates({
        subscriptions: [s],
        today: "2026-06-15",
        daysBeforeCadence: [],
      }),
    ).toEqual([]);
  });

  it("flags autoRenewConfirmed=true when sub.autoRenew is true", () => {
    const s = sub({ id: "s9", validUntil: "2026-06-22" });
    const result = findRenewalReminderCandidates({
      subscriptions: [s],
      today: "2026-06-15",
      daysBeforeCadence: [7],
    });
    expect(result[0].autoRenewConfirmed).toBe(true);
  });
});

// ── formatRenewalAmount ─────────────────────────────────────

describe("formatRenewalAmount", () => {
  it("formats EUR with €", () => {
    expect(formatRenewalAmount(sub({ priceCentsAtPurchase: 17000 }))).toBe("€170.00");
  });
  it("formats GBP with £", () => {
    expect(
      formatRenewalAmount(sub({ priceCentsAtPurchase: 17000, currencyAtPurchase: "GBP" })),
    ).toBe("£170.00");
  });
  it("returns null for zero / negative / null prices", () => {
    expect(formatRenewalAmount(sub({ priceCentsAtPurchase: null }))).toBeNull();
    expect(formatRenewalAmount(sub({ priceCentsAtPurchase: 0 }))).toBeNull();
    expect(formatRenewalAmount(sub({ priceCentsAtPurchase: -100 }))).toBeNull();
  });
});
