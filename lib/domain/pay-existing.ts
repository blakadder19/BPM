/**
 * Amount to charge when a student pays an existing pending subscription
 * online. Only the amount frozen on the row when it was created may be
 * charged — never the live product price, which may have changed (or
 * would drop a discount that was applied at assignment time).
 */

export const MISSING_FROZEN_AMOUNT_MESSAGE =
  "This plan is missing its original payment amount. Please contact BPM before paying.";

export const NOTHING_TO_CHARGE_MESSAGE =
  "This plan has no amount to pay online. Please contact BPM.";

export type PayExistingChargeResult =
  | { ok: true; chargeCents: number }
  | { ok: false; error: string };

export function resolvePayExistingChargeCents(sub: {
  priceCentsAtPurchase: number | null | undefined;
}): PayExistingChargeResult {
  const frozen = sub.priceCentsAtPurchase;
  if (frozen == null || !Number.isInteger(frozen) || frozen < 0) {
    return { ok: false, error: MISSING_FROZEN_AMOUNT_MESSAGE };
  }
  if (frozen === 0) return { ok: false, error: NOTHING_TO_CHARGE_MESSAGE };
  return { ok: true, chargeCents: frozen };
}
