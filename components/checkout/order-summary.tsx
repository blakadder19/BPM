"use client";

/**
 * Phase 15 — shared checkout price breakdown.
 *
 * Renders, in order:
 *
 *   Subtotal        €XX.XX
 *   Discount       −€XX.XX   (only when a discount applied)
 *   VAT (23%)       €XX.XX   (only when VAT applied)
 *   Total           €XX.XX
 *
 * DISPLAY ONLY. Every figure shown here is recomputed server-side
 * before a Stripe session is created or a purchase row is written, so
 * a stale or tampered client value can never change what the customer
 * is charged.
 *
 * When VAT is disabled the VAT row is omitted entirely rather than
 * rendered as €0.00 — a zero VAT line is noise for an academy that
 * does not charge VAT, and the brief calls for the existing UI to be
 * unchanged in that case.
 */

interface Props {
  /** Pre-discount list price. */
  basePriceCents: number;
  /** Total discount applied. 0 renders no discount row. */
  discountAmountCents?: number;
  /** Post-discount, pre-VAT amount. Falls back to base − discount. */
  subtotalExVatCents?: number | null;
  /** VAT charged. 0 or null renders no VAT row. */
  vatAmountCents?: number | null;
  /** Rate for the VAT row label, e.g. 23 renders "VAT (23%)". */
  vatRatePercent?: number | null;
  /** Amount actually payable. Falls back to subtotal + VAT. */
  totalCents: number;
  /** Optional short label for what the discount was, e.g. a promo code. */
  discountLabel?: string | null;
  className?: string;
}

function euros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatRate(rate: number): string {
  const rounded = Math.round(rate * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function OrderSummary({
  basePriceCents,
  discountAmountCents = 0,
  subtotalExVatCents,
  vatAmountCents,
  vatRatePercent,
  totalCents,
  discountLabel,
  className,
}: Props) {
  const hasDiscount = discountAmountCents > 0;
  const hasVat = (vatAmountCents ?? 0) > 0;
  const subtotal = subtotalExVatCents ?? basePriceCents - discountAmountCents;

  // Nothing worth showing: no discount, no VAT. The caller renders its
  // own single price line in that case.
  if (!hasDiscount && !hasVat) return null;

  return (
    <div className={`space-y-0.5 text-sm ${className ?? ""}`}>
      <Row label="Subtotal" value={euros(basePriceCents)} />
      {hasDiscount && (
        <Row
          label={discountLabel ? `Discount · ${discountLabel}` : "Discount"}
          value={`−${euros(discountAmountCents)}`}
        />
      )}
      {hasVat && (
        <>
          {/* Only meaningful alongside VAT — without it this duplicates
              the Subtotal row above. */}
          {hasDiscount && <Row label="Subtotal excluding VAT" value={euros(subtotal)} />}
          <Row
            label={`VAT (${formatRate(vatRatePercent ?? 0)}%)`}
            value={euros(vatAmountCents ?? 0)}
          />
        </>
      )}
      <div className="flex items-center justify-between border-t border-current/15 pt-1 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{euros(totalCents)}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
