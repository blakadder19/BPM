"use server";

import { revalidatePath } from "next/cache";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import {
  validateAndPreparePurchase,
  createPurchaseSubscription,
  type PurchaseInput,
  type PreparedPurchase,
} from "./catalog-purchase";
import { getProductRepo, getSubscriptionRepo } from "@/lib/repositories";

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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
