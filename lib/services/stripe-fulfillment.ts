import "server-only";

/**
 * Trusted Stripe fulfilment.
 *
 * These functions mark subscriptions as PAID and must never be reachable as
 * Server Actions. They trust `metadata` only because it was written by BPM
 * at session creation and read back from Stripe; they do NOT check payment
 * status themselves. The only caller is `routeStripeSessionFulfillment`,
 * which requires a Stripe-retrieved (or signature-verified) session with
 * `payment_status === "paid"`.
 */

import { revalidatePath } from "next/cache";
import {
  createPurchaseSubscription,
  type PreparedPurchase,
} from "@/lib/services/purchase-subscription";
import { getProductRepo, getSubscriptionRepo, getStudentRepo } from "@/lib/repositories";
import {
  deserializePricingFromStripe,
  readVatFromStripeMetadata,
  attachClaimRelations,
} from "@/lib/services/pricing-service";
import { paymentConfirmedEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import { isEmailEnabled } from "@/lib/communications/email-provider";

/**
 * Fire a `payment_confirmed` notification + email for a successful
 * Stripe-paid subscription. Never throws — email failure must never
 * roll back fulfillment, since Stripe has already charged the
 * student. Idempotent across the webhook / success-page reconciliation
 * race because the comm event carries
 * `payment_confirmed:<studentId>:<subscriptionId>` as its idempotency
 * key (see lib/communications/builders.ts).
 */
async function dispatchStripePaymentConfirmed(args: {
  studentId: string;
  subscriptionId: string;
  productName: string;
  amountCents: number | null;
  originalPriceCents: number | null;
  discountAmountCents: number | null;
  appliedDiscountSummary: string | null;
  /** Phase 15 — frozen VAT, so the receipt can itemise it. */
  vatAmountCents?: number | null;
  vatRatePercent?: number | null;
  totalIncVatCents?: number | null;
}): Promise<void> {
  try {
    const student = await getStudentRepo().getById(args.studentId);
    const studentName = student?.fullName ?? "BPM student";
    // Headline amount is what the customer was charged — VAT
    // inclusive when VAT applied.
    const chargedCents = args.totalIncVatCents ?? args.amountCents;
    const amountLabel =
      chargedCents != null ? `€${(chargedCents / 100).toFixed(2)}` : null;

    if (!isEmailEnabled()) {
      console.info(
        `[stripe-fulfill] BREVO_API_KEY not set — purchase confirmation email skipped for subscription=${args.subscriptionId}. In-app notification still dispatched.`,
      );
    }

    await dispatchCommEvents([
      paymentConfirmedEvent({
        studentId: args.studentId,
        studentName,
        productName: args.productName,
        subscriptionId: args.subscriptionId,
        amountLabel,
        paymentMethod: "stripe",
        originalPriceCents: args.originalPriceCents,
        discountAmountCents: args.discountAmountCents,
        finalPriceCents: args.amountCents,
        vatAmountCents: args.vatAmountCents ?? null,
        vatRatePercent: args.vatRatePercent ?? null,
        totalIncVatCents: args.totalIncVatCents ?? null,
        appliedDiscountSummary: args.appliedDiscountSummary,
      }),
    ]);
  } catch (e) {
    console.warn(
      "[stripe-fulfill] payment_confirmed dispatch failed (purchase already fulfilled):",
      e instanceof Error ? e.message : e,
    );
  }
}

// ── New purchase fulfilment ──────────────────────────────────────

export async function fulfillStripeCheckout(
  sessionId: string,
  metadata: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const studentId = metadata.bpm_student_id;
  const productId = metadata.bpm_product_id;
  const termId = metadata.bpm_term_id || null;
  const validFrom = metadata.bpm_valid_from;
  const validUntil = metadata.bpm_valid_until || null;
  const assignedTermName = metadata.bpm_assigned_term_name || null;
  const selectedStyleId = metadata.bpm_selected_style_id || null;
  const selectedStyleName = metadata.bpm_selected_style_name || null;
  const selectedStyleIds = metadata.bpm_selected_style_ids
    ? (JSON.parse(metadata.bpm_selected_style_ids) as string[])
    : null;
  const selectedStyleNames = metadata.bpm_selected_style_names
    ? (JSON.parse(metadata.bpm_selected_style_names) as string[])
    : null;
  const autoRenewMeta = metadata.bpm_auto_renew;

  if (!studentId || !productId || !validFrom) {
    return { success: false, error: "Missing required metadata in session." };
  }

  // Idempotency: check if a subscription already exists for this Stripe session
  const allSubs = await getSubscriptionRepo().getAll();
  const alreadyFulfilled = allSubs.some(
    (s) =>
      s.studentId === studentId &&
      s.paymentReference === `stripe:${sessionId}`,
  );
  if (alreadyFulfilled) {
    console.info(
      `[stripe-fulfill] Already fulfilled session ${sessionId} — skipping.`,
    );
    return { success: true };
  }

  const product = await getProductRepo().getById(productId);
  if (!product) {
    return { success: false, error: `Product ${productId} not found.` };
  }

  // Also check for duplicate product+term subscription. Stackability:
  //   * drop-ins are always stackable
  //   * passes/memberships are stackable unless explicitly marked
  //     non-stackable on the product row.
  // Without this gate the webhook would silently swallow every second
  // legitimate purchase (e.g. Bronze Pass — Salsa, then Bronze Pass —
  // Bachata) as a "duplicate".
  const isStackable =
    product.productType === "drop_in" ||
    product.allowMultipleActivePurchases !== false;
  if (!isStackable) {
    const hasDuplicate = allSubs.some(
      (s) =>
        s.studentId === studentId &&
        s.productId === productId &&
        s.status === "active" &&
        s.paymentStatus === "paid" &&
        (termId ? s.termId === termId : true),
    );
    if (hasDuplicate) {
      console.warn(
        `[stripe-fulfill] Duplicate active+paid subscription for student=${studentId} product=${productId} — skipping.`,
      );
      return { success: true };
    }
  }

  // Phase 7 — pull the referral code (if any) out of session metadata
  // so createPurchaseSubscription can create the pending referral row.
  const referralCode = (metadata.bpm_referral_code ?? "").trim() || null;

  // Phase 7 — webhook context lacks a populated AuthUser, so hydrate
  // the purchaser's email from the student repo. The referral-code
  // helper uses it for dedup against guest/email-only referrals.
  let purchaserEmail = "";
  try {
    const purchaser = await getStudentRepo().getById(studentId);
    purchaserEmail = purchaser?.email ?? "";
  } catch (e) {
    console.warn(
      "[stripe-fulfill] purchaser email lookup failed (non-fatal):",
      e instanceof Error ? e.message : e,
    );
  }

  const prepared: PreparedPurchase = {
    user: {
      id: studentId,
      email: purchaserEmail,
      fullName: "",
      role: "student",
      avatarUrl: null,
      academyId: "",
      emailConfirmed: true,
    },
    product,
    termId,
    validFrom,
    validUntil,
    assignedTermName,
    selectedStyleId,
    selectedStyleName,
    selectedStyleIds,
    selectedStyleNames,
    autoRenew: autoRenewMeta === "true" ? true : autoRenewMeta === "false" ? false : product.autoRenew,
    referralCode,
  };

  // Phase 4 hardening: rehydrate the frozen pricing computed at session
  // creation. If we have it, we pass it through to the subscription
  // creation path so the row is written with exactly the discount state
  // the student saw — preventing drift from rule edits or first-time
  // races between session creation and webhook callback.
  let frozenPricing = undefined;
  const transit = metadata.bpm_pricing_snapshot;
  if (transit) {
    // Pass `metadata` so the VAT breakdown is rehydrated from the flat
    // bpm_vat_* keys. VAT is NEVER recomputed here — if the rate
    // changed between session creation and payment, the purchase keeps
    // what the customer was actually charged.
    const restored = await deserializePricingFromStripe(transit, metadata);
    if (restored) {
      frozenPricing = restored;
    } else {
      console.warn(
        `[stripe-fulfill] session=${sessionId} bpm_pricing_snapshot present but unparsable — falling back to live engine.`,
      );
    }
  } else if (metadata.bpm_discount_amount_cents && metadata.bpm_discount_amount_cents !== "0") {
    // Legacy session that pre-dates the snapshot transit field but recorded a
    // discount via the older flat metadata fields. Synthesize a no-snapshot
    // frozen pricing so the charged amount is preserved verbatim, and warn.
    console.warn(
      `[stripe-fulfill] session=${sessionId} legacy discount metadata without snapshot — preserving charged amount but skipping rule snapshot.`,
    );
    const finalCents = Number(metadata.bpm_final_price_cents ?? 0);
    const baseCents = Number(metadata.bpm_original_price_cents ?? 0);
    const discountCents = Number(metadata.bpm_discount_amount_cents ?? 0);
    if (finalCents > 0 && baseCents > 0) {
      frozenPricing = {
        basePriceCents: baseCents,
        totalDiscountCents: discountCents,
        finalPriceCents: finalCents,
        appliedDiscounts: [],
        snapshot: null,
        // A legacy session may still carry VAT keys if it was created
        // after VAT shipped but before the snapshot was written; read
        // them if present, otherwise this resolves to zero VAT.
        vat: readVatFromStripeMetadata(metadata, finalCents),
      };
    }
  }

  // Full-price purchase with VAT: there is no discount snapshot to
  // rehydrate, but there IS a VAT breakdown that must be persisted.
  // Without this branch a full-price VAT purchase would fulfil with
  // no VAT recorded at all.
  if (!frozenPricing) {
    const vatOnly = readVatFromStripeMetadata(metadata, product.priceCents);
    if (vatOnly.vatApplied) {
      frozenPricing = {
        basePriceCents: vatOnly.subtotalExVatCents,
        totalDiscountCents: 0,
        finalPriceCents: vatOnly.subtotalExVatCents,
        appliedDiscounts: [],
        snapshot: null,
        vat: vatOnly,
      };
    }
  }

  const result = await createPurchaseSubscription(
    prepared,
    {
      method: "stripe",
      status: "paid",
      paidAt: new Date().toISOString(),
      reference: `stripe:${sessionId}`,
      notes: "Paid online via Stripe",
    },
    frozenPricing,
  );

  if (result.success) {
    // Phase 4 hardening: attach the atomic first-time claim (recorded
    // at session creation) to the now-known subscription id so audit
    // can follow the chain claim → session → subscription.
    const claimId = metadata.bpm_first_time_claim_id;
    if (claimId && result.subscriptionId) {
      await attachClaimRelations(claimId, {
        relatedSubscriptionId: result.subscriptionId,
      });
    }

    // Purchase confirmation: in-app notification + email (Brevo).
    // Idempotent — webhook + success-page reconciliation cannot
    // double-send because dispatchCommEvents short-circuits on the
    // notification's idempotency key.
    if (result.subscriptionId) {
      const summary = (result.pricing?.appliedDiscounts ?? [])
        .map((d) => d.name || d.reason || d.ruleType)
        .filter(Boolean)
        .join(" + ");
      await dispatchStripePaymentConfirmed({
        studentId: studentId,
        subscriptionId: result.subscriptionId,
        productName: product.name,
        amountCents: result.pricing?.finalPriceCents ?? product.priceCents ?? null,
        originalPriceCents: result.pricing?.basePriceCents ?? null,
        discountAmountCents: result.pricing?.totalDiscountCents ?? null,
        vatAmountCents: result.pricing?.vat?.vatApplied
          ? result.pricing.vat.vatAmountCents
          : null,
        vatRatePercent: result.pricing?.vat?.vatApplied
          ? result.pricing.vat.vatRatePercent
          : null,
        totalIncVatCents: result.pricing?.vat?.totalIncVatCents ?? null,
        appliedDiscountSummary: summary || null,
      });
    }

    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }

  return result;
}

// ── Pay existing pending subscription fulfillment ─────────────

export async function fulfillExistingSubscriptionPayment(
  sessionId: string,
  metadata: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const subscriptionId = metadata.bpm_subscription_id;
  const studentId = metadata.bpm_student_id;
  if (!subscriptionId || !studentId) {
    return { success: false, error: "Missing metadata for pay-existing fulfillment." };
  }

  const { updateSubscription } = await import("@/lib/services/subscription-service");

  const allSubs = await getSubscriptionRepo().getAll();
  const sub = allSubs.find((s) => s.id === subscriptionId && s.studentId === studentId);
  if (!sub) return { success: false, error: "Subscription not found." };

  if (sub.paymentStatus === "paid" && sub.paymentReference === `stripe:${sessionId}`) {
    return { success: true };
  }

  const result = await updateSubscription(subscriptionId, {
    paymentStatus: "paid",
    paymentMethod: "stripe",
    paidAt: new Date().toISOString(),
    paymentReference: `stripe:${sessionId}`,
    paymentNotes: "Paid online via Stripe",
  });

  if (result.success) {
    // Purchase confirmation: identical flow to fulfillStripeCheckout.
    // The frozen subscription row already carries the correct
    // priceCentsAtPurchase / discount fields, so we read them rather
    // than recomputing.
    const summary = (() => {
      const ad = sub.appliedDiscount;
      if (!ad || !Array.isArray(ad)) return null;
      const labels = ad
        .map((d) => d?.name || d?.reason || d?.ruleType)
        .filter(Boolean) as string[];
      return labels.length > 0 ? labels.join(" + ") : null;
    })();
    await dispatchStripePaymentConfirmed({
      studentId: sub.studentId,
      subscriptionId,
      productName: sub.productName,
      amountCents: sub.subtotalExVatCents ?? sub.priceCentsAtPurchase ?? null,
      originalPriceCents: sub.originalPriceCents ?? null,
      discountAmountCents: sub.discountAmountCents ?? null,
      vatAmountCents: sub.vatAmountCents ?? null,
      vatRatePercent: sub.vatRatePercent ?? null,
      totalIncVatCents: sub.totalIncVatCents ?? sub.priceCentsAtPurchase ?? null,
      appliedDiscountSummary: summary,
    });

    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }

  return result;
}
