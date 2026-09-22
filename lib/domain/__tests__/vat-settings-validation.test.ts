/**
 * Phase 15 — mirrors the VAT validation block inside
 * `lib/actions/settings.ts` (`saveSettings`).
 *
 * The action itself is a Next.js server action that pulls auth and
 * Supabase, so — following the existing `manual-discount.test.ts`
 * convention in this repo — we re-implement the small pure rule set it
 * applies and lock the behaviour in. If the production action drifts,
 * this still catches regressions against the documented rules.
 */
import { describe, it, expect } from "vitest";
import { validateVatRatePercent } from "@/lib/domain/vat";

interface VatFormInput {
  vatEnabled: boolean;
  vatRatePercentRaw: string;
  vatPriceModeRaw: string;
  applyVatToOnlinePayments: boolean;
  applyVatToManualPayments: boolean;
}

type VatSaveResult =
  | {
      ok: true;
      patch: {
        vatEnabled: boolean;
        vatRatePercent: number;
        vatPriceMode: "exclusive" | "inclusive";
        applyVatToOnlinePayments: boolean;
        applyVatToManualPayments: boolean;
      };
    }
  | { ok: false; error: string };

/** Mirrors lib/actions/settings.ts — keep in sync. */
function applyVatSettingsRules(input: VatFormInput): VatSaveResult {
  const rateCheck = validateVatRatePercent(Number(input.vatRatePercentRaw));
  if (!rateCheck.ok) return { ok: false, error: rateCheck.message };

  if (input.vatPriceModeRaw !== "exclusive" && input.vatPriceModeRaw !== "inclusive") {
    return { ok: false, error: "VAT price mode must be either exclusive or inclusive." };
  }

  if (input.vatEnabled && rateCheck.ratePercent === 0) {
    return { ok: false, error: "Set a VAT rate above 0% before enabling VAT." };
  }

  return {
    ok: true,
    patch: {
      vatEnabled: input.vatEnabled,
      vatRatePercent: rateCheck.ratePercent,
      vatPriceMode: input.vatPriceModeRaw,
      applyVatToOnlinePayments: input.applyVatToOnlinePayments,
      applyVatToManualPayments: input.applyVatToManualPayments,
    },
  };
}

function form(over: Partial<VatFormInput> = {}): VatFormInput {
  return {
    vatEnabled: true,
    vatRatePercentRaw: "23",
    vatPriceModeRaw: "exclusive",
    applyVatToOnlinePayments: true,
    applyVatToManualPayments: false,
    ...over,
  };
}

describe("VAT settings validation", () => {
  it("accepts a normal configuration", () => {
    const r = applyVatSettingsRules(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch.vatRatePercent).toBe(23);
    expect(r.patch.vatPriceMode).toBe("exclusive");
  });

  it("accepts a decimal reduced rate", () => {
    const r = applyVatSettingsRules(form({ vatRatePercentRaw: "13.5" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.vatRatePercent).toBe(13.5);
  });

  it("accepts inclusive mode", () => {
    const r = applyVatSettingsRules(form({ vatPriceModeRaw: "inclusive" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.vatPriceMode).toBe("inclusive");
  });

  it("allows saving a 0 rate while VAT is DISABLED", () => {
    // This is the shipped default state, so it must be savable.
    const r = applyVatSettingsRules(form({ vatEnabled: false, vatRatePercentRaw: "0" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.vatEnabled).toBe(false);
  });

  it("refuses to enable VAT at a 0% rate", () => {
    const r = applyVatSettingsRules(form({ vatRatePercentRaw: "0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/above 0%/i);
  });

  it("rejects a negative rate", () => {
    const r = applyVatSettingsRules(form({ vatRatePercentRaw: "-5" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/negative/i);
  });

  it("rejects a rate above 100", () => {
    const r = applyVatSettingsRules(form({ vatRatePercentRaw: "150" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceed/i);
  });

  it("rejects a non-numeric rate", () => {
    const r = applyVatSettingsRules(form({ vatRatePercentRaw: "twenty-three" }));
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown price mode", () => {
    const r = applyVatSettingsRules(form({ vatPriceModeRaw: "gross" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exclusive or inclusive/i);
  });

  it("preserves the online/manual applicability flags independently", () => {
    const r = applyVatSettingsRules(
      form({ applyVatToOnlinePayments: false, applyVatToManualPayments: true }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch.applyVatToOnlinePayments).toBe(false);
    expect(r.patch.applyVatToManualPayments).toBe(true);
  });
});
