"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import {
  validateAndPreparePurchase,
  createPurchaseSubscription,
  type PurchaseInput,
  type PreparedPurchase,
} from "./catalog-purchase";
import { getProductRepo, getSubscriptionRepo } from "@/lib/repositories";

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
              description:
                assignedTermName
                  ? `${product.description ?? product.name} — ${assignedTermName}`
                  : (product.description ?? product.name),
            },
            unit_amount: product.priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bpm_student_id: user.id,
        bpm_product_id: product.id,
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
      },
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
    });

    return { success: true, url: session.url ?? undefined };
  } catch (e) {
    console.error(
      "[stripe-checkout] Session creation failed:",
      e instanceof Error ? e.message : e,
    );
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
            unit_amount: product.priceCents,
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

// ── Webhook fulfillment ──────────────────────────────────────

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

  // Also check for duplicate product+term subscription
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

  const product = await getProductRepo().getById(productId);
  if (!product) {
    return { success: false, error: `Product ${productId} not found.` };
  }

  const prepared: PreparedPurchase = {
    user: {
      id: studentId,
      email: "",
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
  };

  const result = await createPurchaseSubscription(prepared, {
    method: "stripe",
    status: "paid",
    paidAt: new Date().toISOString(),
    reference: `stripe:${sessionId}`,
    notes: "Paid online via Stripe",
  });

  if (result.success) {
    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }

  return result;
}

// ── Create Stripe Checkout for event product ─────────────────

export async function createEventStripeCheckoutAction(input: {
  eventProductId: string;
  eventId: string;
  eventProductName: string;
  eventProductDescription: string | null;
  priceCents: number;
}): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isStripeEnabled()) {
    return {
      success: false,
      error: "Online payment is not yet available. Please pay at reception.",
    };
  }

  const { requireRole } = await import("@/lib/auth");
  const user = await requireRole(["student"]);

  const appUrl = await resolveAppUrl();

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
              name: input.eventProductName,
              description: input.eventProductDescription ?? input.eventProductName,
            },
            unit_amount: input.priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bpm_purchase_type: "event",
        bpm_student_id: user.id,
        bpm_event_product_id: input.eventProductId,
        bpm_event_id: input.eventId,
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
      return { success: false, error: "This event is sold out" };
    }
  }

  const appUrl = await resolveAppUrl();

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
            unit_amount: product.priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bpm_purchase_type: "event_guest",
        bpm_event_product_id: input.eventProductId,
        bpm_event_id: input.eventId,
        bpm_guest_name: input.guestName,
        bpm_guest_email: input.guestEmail,
        bpm_guest_phone: input.guestPhone ?? "",
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
    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }

  return result;
}
