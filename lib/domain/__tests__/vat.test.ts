import { describe, it, expect } from "vitest";
import {
  calculateVat,
  noVat,
  computeVatForPayment,
  resolveVatPolicy,
  paymentChannelFor,
  allocateRefundedVat,
  toBasisPoints,
  validateVatRatePercent,
  formatVatRate,
  type VatSettingsLike,
} from "@/lib/domain/vat";

function settings(over: Partial<VatSettingsLike> = {}): VatSettingsLike {
  return {
    vatEnabled: true,
    vatRatePercent: 23,
    vatPriceMode: "exclusive",
    applyVatToOnlinePayments: true,
    applyVatToManualPayments: false,
    ...over,
  };
}

// ── basis points ─────────────────────────────────────────────

describe("toBasisPoints", () => {
  it("converts whole rates", () => {
    expect(toBasisPoints(23)).toBe(2300);
    expect(toBasisPoints(20)).toBe(2000);
  });
  it("converts decimal rates without drift", () => {
    expect(toBasisPoints(13.5)).toBe(1350);
    expect(toBasisPoints(9.25)).toBe(925);
    expect(toBasisPoints(4.8)).toBe(480);
  });
  it("treats zero/negative/non-finite as 0", () => {
    expect(toBasisPoints(0)).toBe(0);
    expect(toBasisPoints(-5)).toBe(0);
    expect(toBasisPoints(NaN)).toBe(0);
  });
});

describe("validateVatRatePercent", () => {
  it("accepts 0 and 100 at the boundaries", () => {
    expect(validateVatRatePercent(0)).toEqual({ ok: true, ratePercent: 0 });
    expect(validateVatRatePercent(100)).toEqual({ ok: true, ratePercent: 100 });
  });
  it("accepts decimal rates", () => {
    expect(validateVatRatePercent(13.5)).toEqual({ ok: true, ratePercent: 13.5 });
  });
  it("snaps to 2 decimal places", () => {
    expect(validateVatRatePercent(23.456)).toEqual({ ok: true, ratePercent: 23.46 });
  });
  it("rejects negative", () => {
    const r = validateVatRatePercent(-1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/negative/i);
  });
  it("rejects above 100", () => {
    const r = validateVatRatePercent(101);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/exceed/i);
  });
  it("rejects NaN", () => {
    expect(validateVatRatePercent(NaN).ok).toBe(false);
  });
});

// ── exclusive mode ───────────────────────────────────────────

describe("calculateVat — exclusive mode", () => {
  it("adds 23% on top of a net amount", () => {
    const r = calculateVat({ amountCents: 10000, vatRatePercent: 23, priceMode: "exclusive" });
    expect(r.subtotalExVatCents).toBe(10000);
    expect(r.vatAmountCents).toBe(2300);
    expect(r.totalIncVatCents).toBe(12300);
    expect(r.vatRatePercent).toBe(23);
    expect(r.vatPriceMode).toBe("exclusive");
    expect(r.vatApplied).toBe(true);
  });

  it("adds 20%", () => {
    const r = calculateVat({ amountCents: 5000, vatRatePercent: 20, priceMode: "exclusive" });
    expect(r.vatAmountCents).toBe(1000);
    expect(r.totalIncVatCents).toBe(6000);
  });

  it("handles a decimal rate (13.5%) with integer rounding", () => {
    // 6500 × 1350 / 10000 = 877.5 → rounds to 878
    const r = calculateVat({ amountCents: 6500, vatRatePercent: 13.5, priceMode: "exclusive" });
    expect(r.vatAmountCents).toBe(878);
    expect(r.totalIncVatCents).toBe(7378);
    expect(r.subtotalExVatCents + r.vatAmountCents).toBe(r.totalIncVatCents);
  });

  it("maintains subtotal + vat === total for many awkward amounts", () => {
    for (let amount = 1; amount <= 2000; amount += 7) {
      for (const rate of [23, 20, 13.5, 9, 4.8, 0.5]) {
        const r = calculateVat({ amountCents: amount, vatRatePercent: rate, priceMode: "exclusive" });
        expect(r.subtotalExVatCents + r.vatAmountCents).toBe(r.totalIncVatCents);
      }
    }
  });

  it("returns a zero breakdown for a 0-cent amount (comped/100% discount)", () => {
    const r = calculateVat({ amountCents: 0, vatRatePercent: 23, priceMode: "exclusive" });
    expect(r.vatAmountCents).toBe(0);
    expect(r.totalIncVatCents).toBe(0);
    expect(r.vatApplied).toBe(false);
  });

  it("returns a zero breakdown for a 0% rate", () => {
    const r = calculateVat({ amountCents: 10000, vatRatePercent: 0, priceMode: "exclusive" });
    expect(r.vatAmountCents).toBe(0);
    expect(r.totalIncVatCents).toBe(10000);
    expect(r.vatApplied).toBe(false);
  });

  it("clamps negative amounts to zero rather than producing negative VAT", () => {
    const r = calculateVat({ amountCents: -500, vatRatePercent: 23, priceMode: "exclusive" });
    expect(r.subtotalExVatCents).toBe(0);
    expect(r.vatAmountCents).toBe(0);
    expect(r.totalIncVatCents).toBe(0);
  });
});

// ── inclusive mode ───────────────────────────────────────────

describe("calculateVat — inclusive mode", () => {
  it("backs 23% out of a gross amount", () => {
    // 12300 × 2300 / 12300 = 2300 exactly
    const r = calculateVat({ amountCents: 12300, vatRatePercent: 23, priceMode: "inclusive" });
    expect(r.totalIncVatCents).toBe(12300);
    expect(r.vatAmountCents).toBe(2300);
    expect(r.subtotalExVatCents).toBe(10000);
    expect(r.vatPriceMode).toBe("inclusive");
    expect(r.vatApplied).toBe(true);
  });

  it("never changes the total the customer pays", () => {
    const r = calculateVat({ amountCents: 6500, vatRatePercent: 23, priceMode: "inclusive" });
    expect(r.totalIncVatCents).toBe(6500);
  });

  it("handles a decimal rate", () => {
    // 6500 × 1350 / 11350 = 773.13... → 773
    const r = calculateVat({ amountCents: 6500, vatRatePercent: 13.5, priceMode: "inclusive" });
    expect(r.vatAmountCents).toBe(773);
    expect(r.subtotalExVatCents).toBe(5727);
    expect(r.subtotalExVatCents + r.vatAmountCents).toBe(6500);
  });

  it("maintains subtotal + vat === total exactly for many awkward amounts", () => {
    for (let amount = 1; amount <= 2000; amount += 7) {
      for (const rate of [23, 20, 13.5, 9, 4.8, 0.5]) {
        const r = calculateVat({ amountCents: amount, vatRatePercent: rate, priceMode: "inclusive" });
        expect(r.subtotalExVatCents + r.vatAmountCents).toBe(r.totalIncVatCents);
        expect(r.totalIncVatCents).toBe(amount);
      }
    }
  });

  it("exclusive then inclusive round-trips back to the same subtotal", () => {
    const ex = calculateVat({ amountCents: 10000, vatRatePercent: 23, priceMode: "exclusive" });
    const inc = calculateVat({
      amountCents: ex.totalIncVatCents,
      vatRatePercent: 23,
      priceMode: "inclusive",
    });
    expect(inc.subtotalExVatCents).toBe(10000);
    expect(inc.vatAmountCents).toBe(ex.vatAmountCents);
  });
});

// ── noVat ────────────────────────────────────────────────────

describe("noVat", () => {
  it("passes the amount through with zero VAT and vatApplied false", () => {
    const r = noVat(6500);
    expect(r.subtotalExVatCents).toBe(6500);
    expect(r.vatAmountCents).toBe(0);
    expect(r.totalIncVatCents).toBe(6500);
    expect(r.vatRatePercent).toBe(0);
    expect(r.vatApplied).toBe(false);
  });
});

// ── payment channel + policy resolution ──────────────────────

describe("paymentChannelFor", () => {
  it("classifies stripe as online", () => {
    expect(paymentChannelFor("stripe")).toBe("online");
  });
  it("classifies every reception method as manual", () => {
    for (const m of ["cash", "card", "bank_transfer", "revolut", "manual", "complimentary"]) {
      expect(paymentChannelFor(m)).toBe("manual");
    }
  });
  it("defaults unknown/null methods to manual (conservative)", () => {
    expect(paymentChannelFor(null)).toBe("manual");
    expect(paymentChannelFor(undefined)).toBe("manual");
    expect(paymentChannelFor("future_wallet")).toBe("manual");
  });
});

describe("resolveVatPolicy", () => {
  it("returns null when VAT is globally disabled", () => {
    expect(resolveVatPolicy(settings({ vatEnabled: false }), "online")).toBeNull();
  });
  it("returns null when the rate is 0 even if enabled", () => {
    expect(resolveVatPolicy(settings({ vatRatePercent: 0 }), "online")).toBeNull();
  });
  it("returns a policy for online when applyVatToOnlinePayments is true", () => {
    expect(resolveVatPolicy(settings(), "online")).toEqual({
      ratePercent: 23,
      priceMode: "exclusive",
    });
  });
  it("returns null for manual by default (manual VAT is opt-in)", () => {
    expect(resolveVatPolicy(settings(), "manual")).toBeNull();
  });
  it("returns a policy for manual once explicitly enabled", () => {
    expect(
      resolveVatPolicy(settings({ applyVatToManualPayments: true }), "manual"),
    ).toEqual({ ratePercent: 23, priceMode: "exclusive" });
  });
  it("returns null for online when online applicability is turned off", () => {
    expect(
      resolveVatPolicy(settings({ applyVatToOnlinePayments: false }), "online"),
    ).toBeNull();
  });
});

describe("computeVatForPayment", () => {
  it("VAT disabled → amount unchanged, no pricing change at all", () => {
    const r = computeVatForPayment({
      settings: settings({ vatEnabled: false }),
      channel: "online",
      amountCents: 6500,
    });
    expect(r.totalIncVatCents).toBe(6500);
    expect(r.subtotalExVatCents).toBe(6500);
    expect(r.vatAmountCents).toBe(0);
    expect(r.vatApplied).toBe(false);
  });

  it("online payment with VAT enabled gets VAT added", () => {
    const r = computeVatForPayment({
      settings: settings(),
      channel: "online",
      amountCents: 6500,
    });
    expect(r.vatAmountCents).toBe(1495);
    expect(r.totalIncVatCents).toBe(7995);
    expect(r.vatApplied).toBe(true);
  });

  it("manual payment does NOT inherit online VAT by default", () => {
    const r = computeVatForPayment({
      settings: settings(),
      channel: "manual",
      amountCents: 6500,
    });
    expect(r.vatAmountCents).toBe(0);
    expect(r.totalIncVatCents).toBe(6500);
    expect(r.vatApplied).toBe(false);
  });

  it("manual payment gets VAT once applyVatToManualPayments is enabled", () => {
    const r = computeVatForPayment({
      settings: settings({ applyVatToManualPayments: true }),
      channel: "manual",
      amountCents: 6500,
    });
    expect(r.vatAmountCents).toBe(1495);
    expect(r.totalIncVatCents).toBe(7995);
  });

  it("applies VAT after a discount, never on the pre-discount price", () => {
    // Base €100, 20% discount → €80 post-discount. VAT must be 23%
    // of 80, not of 100.
    const postDiscount = 8000;
    const r = computeVatForPayment({
      settings: settings(),
      channel: "online",
      amountCents: postDiscount,
    });
    expect(r.subtotalExVatCents).toBe(8000);
    expect(r.vatAmountCents).toBe(1840);
    expect(r.totalIncVatCents).toBe(9840);
    // Sanity: VAT on the PRE-discount amount would have been 2300.
    expect(r.vatAmountCents).not.toBe(2300);
  });
});

// ── refund allocation ────────────────────────────────────────

describe("allocateRefundedVat", () => {
  it("full refund reverses the entire VAT amount", () => {
    expect(
      allocateRefundedVat({
        vatAmountCents: 2300,
        totalIncVatCents: 12300,
        refundedAmountCents: 12300,
      }),
    ).toBe(2300);
  });

  it("over-refund (should not happen) is still capped at the full VAT", () => {
    expect(
      allocateRefundedVat({
        vatAmountCents: 2300,
        totalIncVatCents: 12300,
        refundedAmountCents: 99999,
      }),
    ).toBe(2300);
  });

  it("half refund reverses half the VAT", () => {
    expect(
      allocateRefundedVat({
        vatAmountCents: 2300,
        totalIncVatCents: 12300,
        refundedAmountCents: 6150,
      }),
    ).toBe(1150);
  });

  it("partial refund uses proportional allocation and rounds to a cent", () => {
    // 2300 × 4000 / 12300 = 747.96... → 748
    expect(
      allocateRefundedVat({
        vatAmountCents: 2300,
        totalIncVatCents: 12300,
        refundedAmountCents: 4000,
      }),
    ).toBe(748);
  });

  it("no refund reverses nothing", () => {
    expect(
      allocateRefundedVat({
        vatAmountCents: 2300,
        totalIncVatCents: 12300,
        refundedAmountCents: 0,
      }),
    ).toBe(0);
  });

  it("returns 0 when the transaction carried no VAT", () => {
    expect(
      allocateRefundedVat({
        vatAmountCents: 0,
        totalIncVatCents: 10000,
        refundedAmountCents: 10000,
      }),
    ).toBe(0);
  });

  it("never returns more than the VAT charged, across many partials", () => {
    for (let refunded = 0; refunded <= 12300; refunded += 137) {
      const v = allocateRefundedVat({
        vatAmountCents: 2300,
        totalIncVatCents: 12300,
        refundedAmountCents: refunded,
      });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2300);
    }
  });
});

// ── display ──────────────────────────────────────────────────

describe("formatVatRate", () => {
  it("renders whole rates without a decimal", () => {
    expect(formatVatRate(23)).toBe("23%");
    expect(formatVatRate(0)).toBe("0%");
  });
  it("renders decimal rates", () => {
    expect(formatVatRate(13.5)).toBe("13.5%");
  });
});
