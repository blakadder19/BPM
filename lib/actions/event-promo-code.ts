"use server";

/**
 * Phase 5 — server-side promo-code preview for the event checkout UI.
 *
 * Both the logged-in student dialog and the public guest event page
 * call this when the customer types a code and clicks "Apply". The
 * action re-loads the event product server-side (never trusting the
 * client price), routes through the same `priceEventTicketForStudent`
 * helper used at commit time, and returns either:
 *
 *   * { ok: true, basePriceCents, discountAmountCents, finalPriceCents,
 *       code } — UI can show "Original / Discount / Final".
 *   * { ok: false, error } — UI shows the user-facing error string.
 *
 * IMPORTANT: this is advisory only. The authoritative pricing happens
 * at purchase/checkout creation time. The same engine runs there with
 * the same code, so the preview cannot drift from the final charge.
 *
 * Permissions: none. This is callable by anonymous guests (the public
 * event page is publicly accessible). The action does NOT leak whether
 * a code exists for unrelated products — it only confirms applicability
 * for the specific event ticket being purchased.
 */

import {
  priceEventTicketForStudent,
  type PromoCodeError,
} from "@/lib/services/pricing-service";
import { getSpecialEventRepo } from "@/lib/repositories";
import { studentHasActiveMembership } from "@/lib/domain/active-membership";

export interface PreviewEventPromoCodeInput {
  eventId: string;
  eventProductId: string;
  /** Customer-typed code. Trimmed/upper-cased server-side. */
  promoCode: string;
  /**
   * When the caller is a logged-in student, passing the id enables
   * per-student `one_use_per_email` enforcement. When omitted (guest
   * checkout) `guestEmail` is used instead.
   */
  studentId?: string | null;
  /** Required for guests when `one_use_per_email` is set on the rule. */
  guestEmail?: string | null;
}

export interface PreviewEventPromoCodeResult {
  ok: boolean;
  error?: string;
  /** Echo back the trimmed/upper-cased code for the UI to display. */
  code?: string;
  basePriceCents?: number;
  discountAmountCents?: number;
  finalPriceCents?: number;
}

export async function previewEventPromoCodeAction(
  input: PreviewEventPromoCodeInput,
): Promise<PreviewEventPromoCodeResult> {
  const code = input.promoCode?.trim() ?? "";
  if (!code) {
    return { ok: false, error: "Enter a promo code." };
  }

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(input.eventId);
  if (!event) return { ok: false, error: "Event not found." };

  const product = (await repo.getProductsByEvent(input.eventId)).find(
    (p) => p.id === input.eventProductId,
  );
  if (!product) return { ok: false, error: "Event ticket not found." };
  if (!product.salesOpen) {
    return { ok: false, error: "Sales are not open for this ticket." };
  }

  // Members-only tickets cannot be discounted for non-members — the
  // preview should reflect the same gate the commit path applies, so
  // the customer never sees a discounted preview they cannot redeem.
  if (product.membersOnly) {
    if (!input.studentId) {
      return {
        ok: false,
        error:
          "This ticket is only available to active members. Please log in to apply a promo code.",
      };
    }
    const isMember = await studentHasActiveMembership(input.studentId);
    if (!isMember) {
      return {
        ok: false,
        error:
          "This ticket is only available to active members.",
      };
    }
  }

  const pricing = await priceEventTicketForStudent({
    studentId: input.studentId ?? null,
    product: {
      id: product.id,
      productType: product.productType,
      priceCents: product.priceCents,
    },
    promoCode: code,
    guestEmail: input.guestEmail ?? null,
  });

  if (pricing.promoCodeError) {
    return { ok: false, error: formatPromoError(pricing.promoCodeError) };
  }

  // Defensive: if pricing came back with no discount but no error
  // either, treat as "not eligible". This should never happen with the
  // current service implementation, but the guard keeps the contract
  // clean for the UI.
  if (pricing.totalDiscountCents <= 0) {
    return {
      ok: false,
      error: "This promo code is not valid for this ticket.",
    };
  }

  return {
    ok: true,
    code: code.toUpperCase(),
    basePriceCents: pricing.basePriceCents,
    discountAmountCents: pricing.totalDiscountCents,
    finalPriceCents: pricing.finalPriceCents,
  };
}

function formatPromoError(err: PromoCodeError): string {
  return err.message;
}
