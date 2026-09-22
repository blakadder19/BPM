/**
 * Phase 15 — configurable VAT calculation.
 *
 * Pure domain layer: no IO, no auth, no settings lookup. Callers pass
 * the resolved rate/mode in, which keeps this module trivially
 * testable and safe to import from both server actions and client
 * components (the client uses it for DISPLAY ONLY — every persisted
 * or Stripe-charged amount is recomputed server-side).
 *
 * ── Ordering contract ──────────────────────────────────────
 * VAT is ALWAYS computed on the post-discount amount:
 *
 *   1. base product price          (product.priceCents)
 *   2. discounts                   (pricing engine → finalPriceCents)
 *   3. VAT                         (this module)
 *   4. payable total               (totalIncVatCents)
 *
 * Never call this with `basePriceCents`.
 *
 * ── Rounding ───────────────────────────────────────────────
 * All arithmetic runs on integer cents and integer BASIS POINTS
 * (rate × 100), so a 23% rate is 2300bp and a 13.5% rate is 1350bp.
 * That lets us support decimal rates (Ireland's reduced rate is
 * 13.5%) without ever multiplying by a float fraction, which is where
 * drift creeps in. The single `Math.round` per calculation is applied
 * to an integer-numerator quotient.
 *
 * The invariant `subtotalExVatCents + vatAmountCents === totalIncVatCents`
 * holds exactly in BOTH modes because in each mode we compute two of
 * the three values and derive the third by subtraction/addition
 * rather than rounding it independently.
 */

// ── Types ────────────────────────────────────────────────────

export type VatPriceMode = "exclusive" | "inclusive";

/**
 * The frozen VAT figures stored on a purchase row and echoed into
 * Stripe metadata. Once written these are NEVER recomputed — if an
 * admin changes the VAT rate tomorrow, yesterday's purchase keeps the
 * rate the customer was actually charged.
 */
export interface VatBreakdown {
  /** Post-discount amount excluding VAT. */
  subtotalExVatCents: number;
  /** VAT portion. 0 when VAT is disabled or not applicable. */
  vatAmountCents: number;
  /** What the customer actually pays. Equals subtotal + vat. */
  totalIncVatCents: number;
  /** Rate applied, as a percentage (e.g. 23 or 13.5). 0 when disabled. */
  vatRatePercent: number;
  /** Which interpretation was used for the input amount. */
  vatPriceMode: VatPriceMode;
  /**
   * False when VAT was switched off, not applicable to this payment
   * method, or the rate was 0. Lets callers distinguish
   * "VAT of €0.00 was applied at 0%" from "VAT does not apply here",
   * which matters for receipts and for whether to render a VAT line.
   */
  vatApplied: boolean;
}

/**
 * The persisted shape of {@link VatBreakdown} on a purchase row.
 *
 * Every field is nullable because rows written before VAT tracking
 * existed have no VAT information at all. `null` means "unknown —
 * predates VAT tracking"; `0` means "VAT was evaluated and did not
 * apply". Reporting must not conflate the two, which is why this is
 * nullable rather than defaulted.
 */
export interface VatSnapshotFields {
  subtotalExVatCents: number | null;
  vatAmountCents: number | null;
  vatRatePercent: number | null;
  vatPriceMode: VatPriceMode | null;
  totalIncVatCents: number | null;
}

/** All-null snapshot, used for rows where VAT was never evaluated. */
export const EMPTY_VAT_SNAPSHOT: VatSnapshotFields = {
  subtotalExVatCents: null,
  vatAmountCents: null,
  vatRatePercent: null,
  vatPriceMode: null,
  totalIncVatCents: null,
};

/**
 * Flatten a computed breakdown into the persisted column shape.
 * Always writes concrete numbers (including zeros) so a row created
 * after this feature shipped is distinguishable from a legacy row.
 */
export function toVatSnapshotFields(v: VatBreakdown): VatSnapshotFields {
  return {
    subtotalExVatCents: v.subtotalExVatCents,
    vatAmountCents: v.vatAmountCents,
    vatRatePercent: v.vatRatePercent,
    vatPriceMode: v.vatPriceMode,
    totalIncVatCents: v.totalIncVatCents,
  };
}

export interface CalculateVatInput {
  /**
   * The POST-DISCOUNT amount. In `exclusive` mode this is treated as
   * the net subtotal; in `inclusive` mode it is treated as the
   * gross total that already contains VAT.
   */
  amountCents: number;
  vatRatePercent: number;
  priceMode: VatPriceMode;
}

// ── Rate normalisation ───────────────────────────────────────

/** Maximum supported rate. Guards against a fat-fingered 2300 in settings. */
export const MAX_VAT_RATE_PERCENT = 100;

/**
 * Convert a percentage to integer basis points, e.g. 23 → 2300,
 * 13.5 → 1350, 9.25 → 925.
 *
 * Rates are rounded to 2 decimal places. No real-world VAT rate needs
 * more precision than that, and allowing arbitrary precision would
 * reintroduce the float drift this module exists to avoid.
 */
export function toBasisPoints(ratePercent: number): number {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) return 0;
  return Math.round(ratePercent * 100);
}

/** Inverse of {@link toBasisPoints}; used when reading a stored rate. */
export function fromBasisPoints(basisPoints: number): number {
  return basisPoints / 100;
}

/**
 * Validate a rate for persistence. Returns a normalised value or an
 * error message suitable for showing an admin.
 */
export function validateVatRatePercent(
  raw: number,
): { ok: true; ratePercent: number } | { ok: false; message: string } {
  if (!Number.isFinite(raw)) {
    return { ok: false, message: "VAT rate must be a number." };
  }
  if (raw < 0) {
    return { ok: false, message: "VAT rate cannot be negative." };
  }
  if (raw > MAX_VAT_RATE_PERCENT) {
    return { ok: false, message: `VAT rate cannot exceed ${MAX_VAT_RATE_PERCENT}%.` };
  }
  // Snap to 2dp so the stored value and the computed basis points
  // always agree (23.456 would otherwise store as 23.456 but compute
  // as 2346bp = 23.46%).
  return { ok: true, ratePercent: Math.round(raw * 100) / 100 };
}

// ── Core calculation ─────────────────────────────────────────

/**
 * Build a zero-VAT breakdown for the given amount. Used when VAT is
 * disabled, when the rate is 0, or when VAT does not apply to the
 * payment method. The amount passes through untouched so callers can
 * use the result unconditionally without branching.
 */
export function noVat(
  amountCents: number,
  priceMode: VatPriceMode = "exclusive",
): VatBreakdown {
  const amount = normaliseAmount(amountCents);
  return {
    subtotalExVatCents: amount,
    vatAmountCents: 0,
    totalIncVatCents: amount,
    vatRatePercent: 0,
    vatPriceMode: priceMode,
    vatApplied: false,
  };
}

function normaliseAmount(amountCents: number): number {
  if (!Number.isFinite(amountCents)) return 0;
  return Math.max(0, Math.round(amountCents));
}

/**
 * Split a post-discount amount into subtotal / VAT / total.
 *
 * EXCLUSIVE — the stored product price is NET, VAT is added on top:
 *   subtotal = amount
 *   vat      = round(amount × bp / 10000)
 *   total    = subtotal + vat
 *
 * INCLUSIVE — the stored product price is GROSS, VAT is backed out:
 *   total    = amount
 *   vat      = round(amount × bp / (10000 + bp))
 *   subtotal = total − vat
 *
 * A zero or negative amount (e.g. a 100%-discounted comped ticket)
 * always yields a zero breakdown with `vatApplied: false` — there is
 * no VAT on a €0 transaction.
 */
export function calculateVat(input: CalculateVatInput): VatBreakdown {
  const amount = normaliseAmount(input.amountCents);
  const mode: VatPriceMode = input.priceMode === "inclusive" ? "inclusive" : "exclusive";
  const bp = toBasisPoints(input.vatRatePercent);

  if (amount === 0 || bp === 0) {
    return noVat(amount, mode);
  }

  const ratePercent = fromBasisPoints(bp);

  if (mode === "inclusive") {
    // Back VAT out of a gross amount. Deriving subtotal by
    // subtraction guarantees subtotal + vat === total exactly.
    const vatAmountCents = Math.round((amount * bp) / (10000 + bp));
    return {
      subtotalExVatCents: amount - vatAmountCents,
      vatAmountCents,
      totalIncVatCents: amount,
      vatRatePercent: ratePercent,
      vatPriceMode: "inclusive",
      vatApplied: true,
    };
  }

  // Exclusive: add VAT on top of a net amount.
  const vatAmountCents = Math.round((amount * bp) / 10000);
  return {
    subtotalExVatCents: amount,
    vatAmountCents,
    totalIncVatCents: amount + vatAmountCents,
    vatRatePercent: ratePercent,
    vatPriceMode: "exclusive",
    vatApplied: true,
  };
}

// ── Payment-method applicability ─────────────────────────────

/**
 * Which BPM payment channel a purchase is going through. Stripe/card
 * is "online"; everything collected at the desk (cash, card machine,
 * bank transfer, Revolut, complimentary, admin-assigned) is "manual".
 */
export type VatPaymentChannel = "online" | "manual";

/**
 * The VAT-relevant slice of AppSettings. Declared structurally rather
 * than importing `AppSettings` so this module stays free of any
 * dependency on the settings store (which reaches for `fs` and
 * Supabase).
 */
export interface VatSettingsLike {
  vatEnabled: boolean;
  vatRatePercent: number;
  vatPriceMode: VatPriceMode;
  applyVatToOnlinePayments: boolean;
  applyVatToManualPayments: boolean;
}

/**
 * Map a BPM `PaymentMethod` to a VAT channel.
 *
 * Only `stripe` is online. Everything else — cash, card (the reception
 * terminal), bank_transfer, revolut, manual, complimentary — is
 * collected off-platform and is therefore "manual". This is
 * deliberately an allowlist: a payment method added in future
 * defaults to `manual`, which is the conservative choice because
 * manual VAT is off by default and so a new method can never silently
 * start charging VAT.
 */
export function paymentChannelFor(paymentMethod: string | null | undefined): VatPaymentChannel {
  return paymentMethod === "stripe" ? "online" : "manual";
}

/**
 * Decide whether VAT applies to a given payment, and at what rate.
 *
 * Returns `null` when VAT should NOT be applied, so callers can write
 * `const vat = resolveVatPolicy(...) ?? null` and treat null as
 * "behave exactly as before VAT existed".
 */
export function resolveVatPolicy(
  settings: VatSettingsLike,
  channel: VatPaymentChannel,
): { ratePercent: number; priceMode: VatPriceMode } | null {
  if (!settings.vatEnabled) return null;

  const applicable =
    channel === "online"
      ? settings.applyVatToOnlinePayments
      : settings.applyVatToManualPayments;
  if (!applicable) return null;

  const bp = toBasisPoints(settings.vatRatePercent);
  if (bp === 0) return null;

  return {
    ratePercent: fromBasisPoints(bp),
    priceMode: settings.vatPriceMode === "inclusive" ? "inclusive" : "exclusive",
  };
}

/**
 * One-shot convenience used by every purchase path: resolve the
 * policy for this payment channel and apply it to a post-discount
 * amount. When VAT does not apply, the amount passes through
 * unchanged with `vatApplied: false`.
 */
export function computeVatForPayment(input: {
  settings: VatSettingsLike;
  channel: VatPaymentChannel;
  /** POST-DISCOUNT amount. */
  amountCents: number;
}): VatBreakdown {
  const policy = resolveVatPolicy(input.settings, input.channel);
  if (!policy) {
    return noVat(input.amountCents, input.settings.vatPriceMode ?? "exclusive");
  }
  return calculateVat({
    amountCents: input.amountCents,
    vatRatePercent: policy.ratePercent,
    priceMode: policy.priceMode,
  });
}

// ── Refund allocation ────────────────────────────────────────

/**
 * Work out how much of a transaction's VAT has been handed back,
 * given a cumulative refunded amount.
 *
 * Full refund  → the entire `vatAmountCents` is reversed. We special-
 *                case this rather than letting the proportional
 *                formula round to it, so a full refund can never
 *                leave a stray cent of VAT booked as collected.
 * Partial      → proportional allocation:
 *                    vatRefunded = round(vat × refunded / total)
 *                This is the standard pro-rata treatment and is the
 *                only defensible allocation without line-item detail
 *                (BPM sells single-line transactions, so there is no
 *                ambiguity about WHICH line was refunded).
 * No VAT/zero  → 0.
 *
 * Returns cents. Never exceeds `vatAmountCents`, never negative.
 */
export function allocateRefundedVat(input: {
  vatAmountCents: number;
  totalIncVatCents: number;
  refundedAmountCents: number;
}): number {
  const vat = Math.max(0, Math.round(input.vatAmountCents || 0));
  const total = Math.max(0, Math.round(input.totalIncVatCents || 0));
  const refunded = Math.max(0, Math.round(input.refundedAmountCents || 0));

  if (vat === 0 || total === 0 || refunded === 0) return 0;
  if (refunded >= total) return vat;

  return Math.min(vat, Math.round((vat * refunded) / total));
}

// ── Display helpers ──────────────────────────────────────────

/**
 * Render a rate for a UI label: `23` → "23%", `13.5` → "13.5%".
 * Trailing `.0` is stripped so whole rates don't read as "23.0%".
 */
export function formatVatRate(ratePercent: number): string {
  if (!Number.isFinite(ratePercent)) return "0%";
  const rounded = Math.round(ratePercent * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toString().replace(/0+$/, "").replace(/\.$/, "")}%`;
}
