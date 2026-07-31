"use server";

/**
 * Phase 10 — client-driven pricing preview for the checkout dialog.
 *
 * The catalog page pre-renders each product's engine pricing at load
 * time. When the purchaser applies a referral code inside the dialog,
 * the UI needs an updated {originalPriceCents, discountAmountCents,
 * finalPriceCents, appliedDiscounts} so the "Referral discount (10%)"
 * line appears live — but the ONLY authoritative source is the server
 * engine (Stripe / reception both re-price at commit time so we can
 * never trust a client calculation).
 *
 * This action is preview-only: it never persists a claim and never
 * writes anything. It's safe to call arbitrarily; the actual commit
 * paths run their own `priceProductForStudent({ commit: ... })`
 * downstream and are the source of truth for what the student is
 * charged.
 */

import { requireRole } from "@/lib/auth";
import { getProductRepo } from "@/lib/repositories";
import { previewPricingForStudent } from "@/lib/services/pricing-service";
import type { AppliedDiscount } from "@/lib/domain/pricing-engine";

export interface PreviewPricingSummary {
  productId: string;
  originalPriceCents: number;
  discountAmountCents: number;
  finalPriceCents: number;
  appliedDiscounts: Array<
    Pick<
      AppliedDiscount,
      "code" | "name" | "ruleType" | "affiliationType" | "amountCents"
    >
  >;
}

export interface PreviewProductPricingResult {
  success: boolean;
  error?: string;
  pricing?: PreviewPricingSummary;
}

/**
 * Preview the engine pricing for a single product for the current
 * student, optionally with a referral code applied. Returns the same
 * shape the catalog page maps to `CatalogProduct.appliedDiscounts`
 * so the client can swap the numbers in place.
 *
 * Never throws — server errors return `{ success: false, error }` and
 * the UI falls back to the pre-loaded pricing.
 */
export async function previewProductPricingAction(input: {
  productId: string;
  referralCode?: string | null;
}): Promise<PreviewProductPricingResult> {
  try {
    const user = await requireRole(["student"]);
    const product = await getProductRepo().getById(input.productId);
    if (!product) {
      return { success: false, error: "Product not found." };
    }

    const map = await previewPricingForStudent({
      studentId: user.id,
      products: [
        {
          id: product.id,
          productType: product.productType,
          priceCents: product.priceCents,
          allowedLevels: product.allowedLevels ?? null,
        },
      ],
      // Trimmed to match engine expectations. Empty / null means
      // "no referral code applied" and referral rules are skipped.
      referralCode: (input.referralCode ?? "").trim() || null,
    });
    const result = map.get(product.id);
    if (!result) {
      return { success: false, error: "Could not preview pricing." };
    }

    return {
      success: true,
      pricing: {
        productId: product.id,
        originalPriceCents: result.basePriceCents,
        discountAmountCents: result.totalDiscountCents,
        finalPriceCents: result.finalPriceCents,
        appliedDiscounts: result.appliedDiscounts.map((d) => ({
          code: d.code,
          name: d.name,
          ruleType: d.ruleType,
          affiliationType: d.affiliationType,
          amountCents: d.amountCents,
        })),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[preview-product-pricing] failed:", message);
    return { success: false, error: message };
  }
}
