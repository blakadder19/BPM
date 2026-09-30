"use server";

/**
 * Stripe checkout server actions.
 *
 * SOURCE-OF-TRUTH INVARIANT:
 *   BPM calculates, Stripe charges, webhook persists the frozen result.
 *
 * Concretely:
 *   - `createStripeCheckoutAction` calls priceProductForStudent in COMMIT
 *     mode so any first-time claim is atomically recorded. The session
 *     is then created with `unit_amount = pricing.finalPriceCents` and
 *     the compact frozen snapshot is sent through session metadata.
 *   - `payPendingSubscriptionAction` charges `sub.priceCentsAtPurchase`
 *     verbatim — it never re-prices, never reads `product.priceCents`.
 *   - `fulfillStripeCheckout` (lib/services/stripe-fulfillment.ts, not a
 *     Server Action) rehydrates the frozen snapshot from metadata and
 *     hands it to `createPurchaseSubscription` so the persisted row
 *     matches what Stripe actually charged.
 *
 * Do NOT introduce a parallel pricing path here. All pricing decisions
 * must come from `priceProductForStudent` / `previewPricingForStudent`.
 */

import { headers } from "next/headers";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import {
  validateAndPreparePurchase,
  type PurchaseInput,
} from "@/lib/services/purchase-subscription";
import { getProductRepo, getSubscriptionRepo } from "@/lib/repositories";
import {
  priceProductForStudent,
  priceEventTicketForStudent,
  serializePricingForStripe,
  buildVatStripeMetadata,
  releaseDiscountClaim,
  attachClaimRelations,
} from "@/lib/services/pricing-service";
import { studentHasActiveMembership } from "@/lib/domain/active-membership";

const MEMBERS_ONLY_BLOCKED_MESSAGE = "This ticket is only available to active members.";
const MEMBERS_ONLY_GUEST_MESSAGE = "This ticket is only available to active members. Please log in with your member account to purchase.";

/**
 * Resolve the app's base URL from the incoming request headers.
 * This ensures Stripe return URLs always match the domain the student
 * is currently on — critical for cookie/session continuity after redirect.
 */
async function resolveAppUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? "https";
      return `${proto}://${host}`;
    }
  } catch {
    // headers() unavailable outside a request context — fall through
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// ── Create Stripe Checkout Session ───────────────────────────

export async function createStripeCheckoutAction(
  input: PurchaseInput,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isStripeEnabled()) {
    return {
      success: false,
      error: "Online payment is not yet available. Please pay at reception.",
    };
  }

  const prepared = await validateAndPreparePurchase(input);
  if ("error" in prepared) return { success: false, error: prepared.error };

  const { user, product, termId, assignedTermName, validFrom, validUntil } = prepared;

  const appUrl = await resolveAppUrl();

  // Phase 4 hardening: pre-compute the discount engine in COMMIT mode.
  // If a first-time-purchase rule applies, the atomic claim is recorded
  // BEFORE the Stripe session URL is returned to the student. The same
  // metadata then drives webhook fulfillment, so charged amount and
  // recorded amount remain in lockstep across the whole flow.
  const pricing = await priceProductForStudent({
    studentId: user.id,
    product: {
      id: product.id,
      productType: product.productType,
      priceCents: product.priceCents,
      // Phase 10 — pass the level metadata so the engine's `referral`
      // rule can gate the discount to beginner products only.
      allowedLevels: product.allowedLevels ?? null,
    },
    // Phase 10 — thread the purchaser's referral code so Stripe
    // charges the DISCOUNTED total when the code applies. The frozen
    // pricing then rides through Stripe metadata and the webhook
    // fulfillment restores the same appliedDiscount snapshot.
    referralCode: prepared.referralCode ?? null,
    commit: { source: "stripe_checkout" },
  });
  const pricingTransit = serializePricingForStripe(pricing);
  const lineDescriptionBase =
    assignedTermName
      ? `${product.description ?? product.name} — ${assignedTermName}`
      : (product.description ?? product.name);
  const lineDescription = pricing.snapshot
    ? `${lineDescriptionBase} (discounts applied: ${pricing.appliedDiscounts.map((a) => a.code).join(", ")})`
    : lineDescriptionBase;

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: product.name,
              description: lineDescription,
            },
            // Phase 15: charge the VAT-INCLUSIVE total. When VAT is
            // disabled or not applicable, `totalIncVatCents` equals
            // `finalPriceCents`, so this is a no-op change.
            unit_amount: pricing.vat.totalIncVatCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        ...buildVatStripeMetadata(pricing.vat),
        bpm_student_id: user.id,
        bpm_product_id: product.id,
        // Persist product type + name in Stripe metadata so the
        // reconcile action can surface them to the checkout success
        // page without re-hitting the product repository. Powers the
        // Meta Pixel `Subscribe` event for memberships specifically
        // (Phase 9 tracking).
        bpm_product_type: product.productType,
        bpm_product_name: product.name,
        bpm_term_id: termId ?? "",
        bpm_valid_from: validFrom,
        bpm_valid_until: validUntil ?? "",
        bpm_assigned_term_name: assignedTermName ?? "",
        bpm_auto_renew: String(prepared.autoRenew),
        bpm_selected_style_id: prepared.selectedStyleId ?? "",
        bpm_selected_style_name: prepared.selectedStyleName ?? "",
        bpm_selected_style_ids: prepared.selectedStyleIds
          ? JSON.stringify(prepared.selectedStyleIds)
          : "",
        bpm_selected_style_names: prepared.selectedStyleNames
          ? JSON.stringify(prepared.selectedStyleNames)
          : "",
        bpm_original_price_cents: String(pricing.basePriceCents),
        bpm_discount_amount_cents: String(pricing.totalDiscountCents),
        bpm_final_price_cents: String(pricing.finalPriceCents),
        bpm_applied_discount_codes: pricing.appliedDiscounts.map((a) => a.code).join(",") || "",
        // Compact frozen-pricing transit (≤500 chars). Read at fulfillment
        // to avoid re-evaluating mutable rule state.
        bpm_pricing_snapshot: pricingTransit ?? "",
        // Atomic first-time claim id (if any), so fulfillment can attach
        // the resulting subscription id for audit traceability.
        bpm_first_time_claim_id: pricing.claim?.id ?? "",
        // Phase 7 — referral code (referrer's BPM-XXXX). Re-validated
        // server-side at fulfillment; an invalid code is silently dropped.
        bpm_referral_code: prepared.referralCode ?? "",
        // Phase 10 — referral-discount audit trail on the Stripe side.
        // The frozen pricing snapshot above (`bpm_pricing_snapshot`)
        // is the authoritative source; these fields duplicate the
        // referral discount cents/percent so finance queries against
        // Stripe metadata can filter without decoding the snapshot.
        // Empty when no referral rule fired.
        bpm_referral_discount_cents: String(
          pricing.appliedDiscounts
            .filter((a) => a.ruleType === "referral")
            .reduce((s, a) => s + a.amountCents, 0),
        ),
        bpm_referral_discount_percent: pricing.appliedDiscounts.some(
          (a) => a.ruleType === "referral",
        )
          ? "10"
          : "",
      },
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
    });

    if (pricing.claim && session.id) {
      await attachClaimRelations(pricing.claim.id, {
        relatedSessionId: session.id,
      });
    }

    return { success: true, url: session.url ?? undefined };
  } catch (e) {
    console.error(
      "[stripe-checkout] Session creation failed:",
      e instanceof Error ? e.message : e,
    );
    // Stripe session creation crashed AFTER the atomic claim was
    // recorded — release so the student can retry. (Only applies when
    // Stripe.checkout.sessions.create itself threw; a successful return
    // followed by the user abandoning the URL leaves the claim in
    // place, which is intentional — see migration 00057 docstring.)
    if (pricing.claim) {
      await releaseDiscountClaim(
        pricing.claim.id,
        "stripe_session_create_threw",
      );
    }
    return {
      success: false,
      error: "Could not start online payment. Please try again or pay at reception.",
    };
  }
}

// ── Pay existing pending subscription via Stripe ─────────────

export async function payPendingSubscriptionAction(
  subscriptionId: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isStripeEnabled()) {
    return {
      success: false,
      error: "Online payment is not yet available. Please pay at reception.",
    };
  }

  const { requireRole } = await import("@/lib/auth");
  const user = await requireRole(["student"]);

  const allSubs = await getSubscriptionRepo().getAll();
  const sub = allSubs.find((s) => s.id === subscriptionId && s.studentId === user.id);
  if (!sub) return { success: false, error: "Subscription not found." };
  if (sub.paymentStatus !== "pending") {
    return { success: false, error: "This plan is already paid." };
  }

  const product = await getProductRepo().getById(sub.productId);
  if (!product) return { success: false, error: "Product not found." };

  const appUrl = await resolveAppUrl();

  // Phase 4 hardening: the subscription row already has the correct
  // price-at-purchase frozen at creation time (incl. any discount that was
  // applied via priceProductForStudent). We MUST charge exactly that
  // amount, NOT the live product.priceCents — otherwise discounted pending
  // subs get billed at full price.
  const chargeCents = sub.priceCentsAtPurchase ?? product.priceCents;

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: product.name,
              description: sub.termId
                ? `Payment for existing plan — ${sub.productName}`
                : sub.productName,
            },
            unit_amount: chargeCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bpm_mode: "pay_existing",
        bpm_subscription_id: subscriptionId,
        bpm_student_id: user.id,
      },
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
    });

    return { success: true, url: session.url ?? undefined };
  } catch (e) {
    console.error(
      "[stripe-checkout] Pay-existing session creation failed:",
      e instanceof Error ? e.message : e,
    );
    return {
      success: false,
      error: "Could not start online payment. Please try again or pay at reception.",
    };
  }
}

// ── Create Stripe Checkout for event product ─────────────────

export async function createEventStripeCheckoutAction(input: {
  eventProductId: string;
  eventId: string;
  eventProductName: string;
  eventProductDescription: string | null;
  priceCents: number;
  /** Phase 5 — optional collaborator promo code. */
  promoCode?: string | null;
}): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isStripeEnabled()) {
    return {
      success: false,
      error: "Online payment is not yet available. Please pay at reception.",
    };
  }

  const { requireRole } = await import("@/lib/auth");
  const user = await requireRole(["student"]);

  // Members-only enforcement: re-load the product on the server (never
  // trust the client-supplied price/name), and if it's restricted,
  // require an active membership before letting Stripe checkout start.
  const { getSpecialEventRepo } = await import("@/lib/repositories");
  const repo = getSpecialEventRepo();
  const product = (await repo.getProductsByEvent(input.eventId)).find(
    (p) => p.id === input.eventProductId,
  );
  if (!product) return { success: false, error: "Event product not found" };
  if (!product.salesOpen) return { success: false, error: "Sales are not open for this product" };
  if (product.membersOnly) {
    const isMember = await studentHasActiveMembership(user.id);
    if (!isMember) return { success: false, error: MEMBERS_ONLY_BLOCKED_MESSAGE };
  }

  const appUrl = await resolveAppUrl();

  // Server-side pricing (Phase 2). BPM is the source of truth — never
  // trust client-supplied amounts. The compact frozen snapshot is sent
  // through Stripe metadata so the webhook persists exactly what the
  // customer was charged, even if the rule changes later.
  const pricing = await priceEventTicketForStudent({
    studentId: user.id,
    product: {
      id: product.id,
      productType: product.productType,
      priceCents: product.priceCents,
    },
    promoCode: input.promoCode ?? null,
  });
  if (pricing.promoCodeError) {
    return { success: false, error: pricing.promoCodeError.message };
  }
  const pricingSnapshotMeta = serializePricingForStripe(pricing);

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: product.name,
              description: product.description ?? product.name,
            },
            // Phase 15 — VAT-inclusive total (no-op when VAT is off).
            unit_amount: pricing.vat.totalIncVatCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        ...buildVatStripeMetadata(pricing.vat),
        bpm_purchase_type: "event",
        bpm_student_id: user.id,
        bpm_event_product_id: input.eventProductId,
        bpm_event_id: input.eventId,
        ...(pricingSnapshotMeta
          ? { bpm_pricing_snapshot: pricingSnapshotMeta }
          : {}),
      },
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
    });

    return { success: true, url: session.url ?? undefined };
  } catch (e) {
    console.error(
      "[stripe-checkout] Event checkout session creation failed:",
      e instanceof Error ? e.message : e,
    );
    return {
      success: false,
      error: "Could not start online payment. Please try again or pay at reception.",
    };
  }
}

// ── Guest Stripe Checkout for event product (no auth) ─────────

export async function createGuestEventStripeCheckoutAction(input: {
  eventProductId: string;
  eventId: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  /** Phase 5 — optional collaborator promo code. */
  promoCode?: string | null;
}): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isStripeEnabled()) {
    return { success: false, error: "Online payment is not yet available." };
  }

  const { getSpecialEventRepo } = await import("@/lib/repositories");
  const repo = getSpecialEventRepo();

  const event = await repo.getEventById(input.eventId);
  if (!event) return { success: false, error: "Event not found" };
  if (!event.isPublic) return { success: false, error: "This event is not available for public purchase" };

  const product = (await repo.getProductsByEvent(input.eventId)).find(
    (p) => p.id === input.eventProductId,
  );
  if (!product) return { success: false, error: "Event product not found" };
  if (!product.salesOpen) return { success: false, error: "Sales are not open for this product" };
  if (product.membersOnly) {
    return { success: false, error: MEMBERS_ONLY_GUEST_MESSAGE };
  }

  const allPurchases = await repo.getPurchasesByEvent(input.eventId);

  const duplicateGuest = allPurchases.find(
    (p) =>
      p.guestEmail?.toLowerCase() === input.guestEmail.toLowerCase() &&
      p.eventProductId === input.eventProductId &&
      p.paymentStatus !== "refunded",
  );
  if (duplicateGuest) {
    return { success: false, error: "A purchase for this product already exists for this email. Please check your email or contact the academy if you need help." };
  }

  if (event.overallCapacity != null) {
    const totalSold = allPurchases.filter((p) => p.paymentStatus !== "refunded").length;
    if (totalSold >= event.overallCapacity) {
      return { success: false, error: "This event is fully booked. No more tickets are currently available." };
    }
  }

  const appUrl = await resolveAppUrl();

  // Phase 5 — guest pricing now flows through the engine so promo
  // codes can apply. Affiliations still cannot (no student id), but
  // event-promo-code rules are evaluated for guests too. The frozen
  // snapshot is forwarded to Stripe metadata so the webhook persists
  // exactly what Stripe charged.
  const pricing = await priceEventTicketForStudent({
    studentId: null,
    product: {
      id: product.id,
      productType: product.productType,
      priceCents: product.priceCents,
    },
    promoCode: input.promoCode ?? null,
    guestEmail: input.guestEmail,
  });
  if (pricing.promoCodeError) {
    return { success: false, error: pricing.promoCodeError.message };
  }
  const guestPricingMeta = serializePricingForStripe(pricing);

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: input.guestEmail,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: product.name,
              description: product.description ?? product.name,
            },
            // Phase 15 — VAT-inclusive total (no-op when VAT is off).
            unit_amount: pricing.vat.totalIncVatCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        ...buildVatStripeMetadata(pricing.vat),
        bpm_purchase_type: "event_guest",
        bpm_event_product_id: input.eventProductId,
        bpm_event_id: input.eventId,
        bpm_guest_name: input.guestName,
        bpm_guest_email: input.guestEmail,
        bpm_guest_phone: input.guestPhone ?? "",
        ...(guestPricingMeta
          ? { bpm_pricing_snapshot: guestPricingMeta }
          : {}),
      },
      success_url: `${appUrl}/event/${input.eventId}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/event/${input.eventId}?purchase=cancelled`,
    });

    return { success: true, url: session.url ?? undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stripe-checkout] Guest event checkout session creation failed:", msg);
    return { success: false, error: `Could not start online payment: ${msg}` };
  }
}
