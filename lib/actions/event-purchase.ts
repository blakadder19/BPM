"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type AuthUser } from "@/lib/auth";
import { requirePermission, requireAnyPermissionForAction } from "@/lib/staff-permissions";
import { getSpecialEventRepo } from "@/lib/repositories";
import { createPurchase, updatePurchasePayment, refundPurchase } from "@/lib/services/special-event-service";
import { sendEventPurchaseEmail, sendEventRefundEmail } from "@/lib/communications/event-emails";
import { centsToEuros, buildInclusionSummary } from "@/lib/services/event-purchase-fulfillment";
import { generateGuestPurchaseQrToken } from "@/lib/domain/checkin-token";
import { logFinanceEvent, type AuditPerformer } from "@/lib/services/finance-audit-log";
import { studentHasActiveMembership } from "@/lib/domain/active-membership";
import {
  buildAuditDiscountMetadata,
  priceEventTicketForStudent,
} from "@/lib/services/pricing-service";
import type { AppliedDiscountSnapshot } from "@/lib/domain/pricing-engine";
import {
  paymentChannelFor,
  toVatSnapshotFields,
  EMPTY_VAT_SNAPSHOT,
  type VatBreakdown,
} from "@/lib/domain/vat";

const MEMBERS_ONLY_BLOCKED_MESSAGE = "This ticket is only available to active members.";
const MEMBERS_ONLY_GUEST_MESSAGE = "This ticket is only available to active members. Please log in with your member account to purchase.";

function performerFromUser(u: AuthUser): AuditPerformer {
  return { userId: u.id, email: u.email, name: u.fullName };
}

function revalidateEventPaths(eventId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/dashboard");
}

/**
 * Phase 2 — discount-aware snapshot built from a frozen pricing result.
 * Use this on every code path that actually creates an event purchase
 * row for a logged-in student so the row, the audit log, and the
 * downstream finance view all agree on the final amount.
 *
 * `final` is the amount the customer actually pays (cents). When `isPaid`
 * is true that amount is mirrored into `paidAmountCents`; for "pending"
 * pay-at-reception rows we keep 0 there so the existing
 * `markEventPurchasePaidAction` flow continues to derive
 * `paidAmountCents` as `original − discount`.
 */
function buildPricedFinancialSnapshot(
  product: { name: string; productType: string },
  pricing: {
    basePriceCents: number;
    totalDiscountCents: number;
    finalPriceCents: number;
    snapshot: AppliedDiscountSnapshot | null;
    vat?: VatBreakdown;
  },
  isPaid: boolean,
) {
  const vat = pricing.vat;
  // The amount actually paid is the VAT-inclusive total. When VAT
  // does not apply `totalIncVatCents === finalPriceCents`, so this
  // matches the pre-VAT behaviour exactly.
  const payable = vat?.vatApplied ? vat.totalIncVatCents : pricing.finalPriceCents;
  return {
    unitPriceCentsAtPurchase: pricing.basePriceCents,
    originalAmountCents: pricing.basePriceCents,
    discountAmountCents: pricing.totalDiscountCents,
    paidAmountCents: isPaid ? payable : 0,
    currency: "eur",
    productNameSnapshot: product.name,
    productTypeSnapshot: product.productType,
    appliedDiscount: pricing.snapshot,
    ...(vat?.vatApplied ? toVatSnapshotFields(vat) : EMPTY_VAT_SNAPSHOT),
  };
}

/**
 * Student purchases an event product with "pay at reception" flow.
 */
export async function createEventPurchaseAction(input: {
  eventProductId: string;
  eventId: string;
  /** Phase 5 — optional collaborator promo code. */
  promoCode?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireRole(["student"]);

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

  const event = await repo.getEventById(input.eventId);
  if (!event) return { success: false, error: "Event not found" };

  const existing = await repo.getPurchasesByStudent(user.id);
  const alreadyBought = existing.find(
    (p) => p.eventProductId === input.eventProductId && p.paymentStatus !== "refunded",
  );
  if (alreadyBought) return { success: false, error: "You have already purchased this product" };

  const allProducts = await repo.getProductsByEvent(input.eventId);
  const activePurchases = existing.filter((p) => p.eventId === input.eventId && p.paymentStatus !== "refunded");
  const ownsFullPass = activePurchases.some((pur) => {
    const prod = allProducts.find((p) => p.id === pur.eventProductId);
    return prod?.productType === "full_pass";
  });
  if (ownsFullPass) return { success: false, error: "You already own the Full Pass for this event, which includes all access" };

  if (event.overallCapacity != null) {
    const allEventPurchases = await repo.getPurchasesByEvent(input.eventId);
    const totalSold = allEventPurchases.filter((p) => p.paymentStatus !== "refunded").length;
    if (totalSold >= event.overallCapacity) {
      return { success: false, error: "This event is fully booked. No more tickets are currently available." };
    }
  }

  // Server-side pricing: BPM is the source of truth for the final
  // amount. The customer sees this on the pending purchase row and the
  // admin sees it when marking the purchase paid at reception.
  const pricing = await priceEventTicketForStudent({
    studentId: user.id,
    product: {
      id: product.id,
      productType: product.productType,
      priceCents: product.priceCents,
    },
    promoCode: input.promoCode ?? null,
    // Pay-at-reception: VAT only applies if an admin has explicitly
    // enabled it for manual payments. Default is off, so desk prices
    // are unchanged by enabling VAT for online checkout.
    vatChannel: "manual",
  });

  // Reject the purchase outright if a promo code was typed but turned
  // out to be invalid/exhausted server-side — the customer expected a
  // discount and we won't silently charge the full price.
  if (pricing.promoCodeError) {
    return { success: false, error: pricing.promoCodeError.message };
  }

  const snapshot = buildPricedFinancialSnapshot(product, pricing, false);

  const result = await createPurchase({
    studentId: user.id,
    eventProductId: input.eventProductId,
    eventId: input.eventId,
    paymentMethod: "manual",
    paymentStatus: "pending",
    ...snapshot,
  });

  if (result.success) {
    revalidateEventPaths(input.eventId);

    if (pricing.totalDiscountCents > 0 && result.data) {
      try {
        logFinanceEvent({
          entityType: "event_purchase",
          entityId: result.data,
          action: "created",
          performer: performerFromUser(user),
          detail: `Discounted event ticket pending: ${product.name}`,
          newValue: centsToEuros(pricing.finalPriceCents),
          metadata: {
            ...(buildAuditDiscountMetadata(pricing) ?? {}),
            kind: "event_purchase_discounted",
          },
        });
      } catch (e) {
        console.warn(
          "[event-purchase] failed to log discount metadata:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    sendEventPurchaseEmail({
      studentId: user.id,
      studentName: user.fullName ?? "Student",
      eventTitle: event.title,
      eventId: input.eventId,
      productName: product.name,
      productType: product.productType,
      priceLabel: centsToEuros(pricing.finalPriceCents),
      paymentStatus: "pending",
      inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
      coverImageUrl: event.coverImageUrl ?? undefined,
    }).catch((err) => console.warn("[event-purchase] Failed to send purchase email:", err));
  }
  return result;
}

/**
 * Guest purchases an event product with "pay at reception" flow (no auth).
 * No QR is generated yet — QR is only issued after payment is confirmed.
 */
export async function createGuestEventPurchaseAction(input: {
  eventProductId: string;
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** Phase 5 — optional collaborator promo code. */
  promoCode?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const { firstName, lastName, email } = input;
  if (!firstName?.trim() || !lastName?.trim()) return { success: false, error: "Name is required" };
  if (!email?.trim() || !email.includes("@")) return { success: false, error: "A valid email is required" };
  const guestName = `${firstName.trim()} ${lastName.trim()}`;

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(input.eventId);
  if (!event) return { success: false, error: "Event not found" };
  if (!event.isPublic) return { success: false, error: "This event is not available for public purchase" };
  if (!event.allowReceptionPayment) return { success: false, error: "Pay at reception is not available for this event" };

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
      p.guestEmail?.toLowerCase() === email.trim().toLowerCase() &&
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

  // Server-side pricing — engine handles promo codes for guests too.
  const pricing = await priceEventTicketForStudent({
    studentId: null,
    product: {
      id: product.id,
      productType: product.productType,
      priceCents: product.priceCents,
    },
    promoCode: input.promoCode ?? null,
    guestEmail: email,
    // Guest pay-at-reception — same manual-channel rule as above.
    vatChannel: "manual",
  });

  if (pricing.promoCodeError) {
    return { success: false, error: pricing.promoCodeError.message };
  }

  const guestSnapshot = buildPricedFinancialSnapshot(product, pricing, false);

  const result = await createPurchase({
    studentId: null,
    eventProductId: input.eventProductId,
    eventId: input.eventId,
    guestName,
    guestEmail: email.trim(),
    guestPhone: input.phone?.trim() || null,
    paymentMethod: "manual",
    paymentStatus: "pending",
    ...guestSnapshot,
  });

  if (result.success) {
    revalidateEventPaths(input.eventId);

    sendEventPurchaseEmail({
      studentId: null,
      studentName: guestName,
      directEmail: email.trim(),
      eventTitle: event.title,
      eventId: input.eventId,
      productName: product.name,
      productType: product.productType,
      priceLabel: centsToEuros(pricing.finalPriceCents),
      paymentStatus: "pending",
      inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
      coverImageUrl: event.coverImageUrl ?? undefined,
    }).catch((err) => console.warn("[event-purchase] Failed to send guest purchase email:", err));
  }
  return result;
}

/**
 * Phase 11 — zero-total guest event purchase.
 *
 * When a 100% event-promo-code brings the ticket total to €0 we cannot
 * (and must not) create a Stripe Checkout Session — Stripe rejects a
 * `unit_amount` below the currency's minimum. Instead this action:
 *
 *   1. Re-validates guest + product + promo code server-side (the
 *      client is never trusted).
 *   2. Runs the SAME `priceEventTicketForStudent` the paid path uses
 *      so the frozen discount snapshot on the row is identical to
 *      what would have gone through Stripe.
 *   3. Asserts `finalPriceCents === 0`. If it isn't, the caller must
 *      fall back to Stripe — we never create a $0-flag row for a
 *      $10 ticket.
 *   4. Generates a QR token, writes the `event_purchases` row as
 *      `paymentMethod: "manual"` + `paymentStatus: "paid"` with a
 *      synthetic `paymentReference: "comp:<uuid>"` (the `comp:` prefix
 *      is the dedup key + the trigger the `/checkout-success` page
 *      uses to skip Stripe session retrieval).
 *   5. Sends the same confirmation email the Stripe path sends so QR
 *      delivery is uniform across paid and comped tickets.
 *   6. Returns the redirect URL the client should navigate to so the
 *      existing conversion tracker mounts on the success page.
 *
 * Idempotency:
 *   * We check for an existing purchase on the same `paymentReference`
 *     before writing. `paymentReference` collisions are astronomically
 *     unlikely (crypto.randomUUID) but the guard costs nothing.
 *   * Duplicate-guest guard is intentionally the same as the
 *     reception path so a tester can't accidentally create two comps
 *     for the same product+email.
 */
export async function createFreeGuestEventPurchaseAction(input: {
  eventProductId: string;
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  promoCode: string;
}): Promise<{
  success: boolean;
  error?: string;
  /** Client navigates here so ConversionTracker fires. */
  redirectUrl?: string;
}> {
  const { firstName, lastName, email, promoCode } = input;
  if (!firstName?.trim() || !lastName?.trim()) return { success: false, error: "Name is required" };
  if (!email?.trim() || !email.includes("@")) return { success: false, error: "A valid email is required" };
  if (!promoCode?.trim()) return { success: false, error: "A promo code is required for free registration" };
  const guestName = `${firstName.trim()} ${lastName.trim()}`;

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
      p.guestEmail?.toLowerCase() === email.trim().toLowerCase() &&
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

  // Same pricing engine as the paid flow — one source of truth. The
  // engine handles the max_uses / one_use_per_email gates for the
  // seeded test rule too so we can't loop past the caps by accident.
  const pricing = await priceEventTicketForStudent({
    studentId: null,
    product: {
      id: product.id,
      productType: product.productType,
      priceCents: product.priceCents,
    },
    promoCode: promoCode.trim(),
    guestEmail: email,
    // €0 comped registration — no money changes hands, so no VAT
    // regardless of configuration. Marked manual for consistency.
    vatChannel: "manual",
  });

  if (pricing.promoCodeError) {
    return { success: false, error: pricing.promoCodeError.message };
  }
  if (pricing.finalPriceCents !== 0) {
    // Defence-in-depth: the client only routes here when the previewed
    // total was €0. If a race edit disabled or narrowed the rule
    // between preview and commit, bail loud so the caller can retry
    // via the paid Stripe path.
    return {
      success: false,
      error: "This promo code no longer brings the total to €0. Please refresh and try again.",
    };
  }

  const qrToken = generateGuestPurchaseQrToken();
  const paymentReference = `comp:${crypto.randomUUID()}`;

  const financials = buildPricedFinancialSnapshot(product, pricing, /*isPaid*/ true);

  const result = await createPurchase({
    studentId: null,
    eventProductId: input.eventProductId,
    eventId: input.eventId,
    guestName,
    guestEmail: email.trim(),
    guestPhone: input.phone?.trim() || null,
    qrToken,
    paymentMethod: "manual",
    paymentStatus: "paid",
    paymentReference,
    paidAt: new Date().toISOString(),
    ...financials,
  });

  if (!result.success) {
    return { success: false, error: result.error ?? "Could not register free ticket." };
  }

  revalidateEventPaths(input.eventId);

  // Finance audit: record the free registration explicitly so
  // /admin/finance queries can filter comped rows without decoding
  // the appliedDiscount snapshot.
  try {
    logFinanceEvent({
      entityType: "event_purchase",
      entityId: result.data ?? paymentReference,
      action: "created",
      detail: `Free guest event ticket via promo code ${promoCode.trim().toUpperCase()} (€0 total).`,
      newValue: `final 0c (saved ${pricing.totalDiscountCents}c)`,
      metadata: {
        ...(buildAuditDiscountMetadata(pricing) ?? {}),
        promoCode: promoCode.trim().toUpperCase(),
        paymentReference,
        eventId: input.eventId,
        eventProductId: input.eventProductId,
        guestEmail: email.trim().toLowerCase(),
      },
    });
  } catch (e) {
    console.warn(
      "[free-event-purchase] failed to log finance event (non-fatal):",
      e instanceof Error ? e.message : e,
    );
  }

  // Confirmation email — mirrors the Stripe branch so the recipient
  // always gets the same QR delivery UX. Best-effort; a failure here
  // must not roll back the €0 registration.
  sendEventPurchaseEmail({
    studentId: null,
    studentName: guestName,
    directEmail: email.trim(),
    eventTitle: event.title,
    eventId: input.eventId,
    productName: product.name,
    productType: product.productType,
    priceLabel: centsToEuros(pricing.finalPriceCents),
    paymentStatus: "paid",
    inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
    qrToken,
    coverImageUrl: event.coverImageUrl ?? undefined,
  }).catch((err) =>
    console.warn(
      "[free-event-purchase] failed to send confirmation email (non-fatal):",
      err instanceof Error ? err.message : err,
    ),
  );

  return {
    success: true,
    redirectUrl: `/event/${input.eventId}/checkout-success?session_id=${paymentReference}`,
  };
}

/**
 * Admin confirms a pending event purchase as paid at reception.
 * For guest purchases: generates QR and sends confirmation email with QR.
 */
export async function markEventPurchasePaidAction(input: {
  purchaseId: string;
  eventId: string;
  receptionMethod: "cash" | "revolut";
}): Promise<{ success: boolean; error?: string }> {
  const adminAccess = await requirePermission("events:mark_paid");
  const admin = adminAccess.user;

  const repo = getSpecialEventRepo();
  const purchases = await repo.getPurchasesByEvent(input.eventId);
  const purchase = purchases.find((p) => p.id === input.purchaseId);

  if (!purchase) return { success: false, error: "Purchase not found" };
  if (purchase.paymentStatus === "paid") return { success: false, error: "Purchase is already paid" };
  if (purchase.paymentStatus === "refunded") return { success: false, error: "Cannot mark a refunded purchase as paid" };

  const isGuestPurchase = !purchase.studentId;
  const qrToken = isGuestPurchase ? generateGuestPurchaseQrToken() : undefined;

  const paidAmountCents = purchase.originalAmountCents != null
    ? purchase.originalAmountCents - (purchase.discountAmountCents ?? 0)
    : null;

  const result = await updatePurchasePayment(input.purchaseId, {
    paymentStatus: "paid",
    receptionMethod: input.receptionMethod,
    paidAt: new Date().toISOString(),
    ...(qrToken ? { qrToken } : {}),
    ...(paidAmountCents != null ? { paidAmountCents } : {}),
  });

  if (result.success) {
    logFinanceEvent({
      entityType: "event_purchase",
      entityId: input.purchaseId,
      action: "marked_paid",
      performer: performerFromUser(admin),
      detail: `Reception method: ${input.receptionMethod}`,
      previousValue: purchase.paymentStatus,
      newValue: "paid",
    });

    revalidateEventPaths(input.eventId);

    if (isGuestPurchase && purchase.guestEmail) {
      const adminTag = `[admin-mark-paid purchase=${input.purchaseId}]`;
      console.info(`${adminTag} Guest purchase marked paid. Sending confirmation email to ${purchase.guestEmail}...`);
      try {
        const [event, product] = await Promise.all([
          repo.getEventById(input.eventId).catch(() => null),
          repo.getProductsByEvent(input.eventId).then((ps) => ps.find((p) => p.id === purchase.eventProductId)).catch(() => null),
        ]);
        if (product) {
          const emailResult = await sendEventPurchaseEmail({
            studentId: null,
            studentName: purchase.guestName ?? "Guest",
            directEmail: purchase.guestEmail,
            eventTitle: event?.title ?? "Special Event",
            eventId: input.eventId,
            productName: product.name,
            productType: product.productType,
            priceLabel: centsToEuros(product.priceCents),
            paymentStatus: "paid",
            inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
            qrToken: qrToken ?? undefined,
            coverImageUrl: event?.coverImageUrl ?? undefined,
          });
          try {
            await repo.updatePurchaseEmailTracking(input.purchaseId, {
              lastEmailType: "payment_confirmation",
              lastEmailSentAt: new Date().toISOString(),
              lastEmailSuccess: emailResult.sent,
            });
          } catch { /* non-critical */ }
          console.info(`${adminTag} Email send completed (sent=${emailResult.sent}).`);
        } else {
          console.warn(`${adminTag} Could not resolve product — email skipped.`);
        }
      } catch (err) {
        console.error(`${adminTag} Email send threw:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return result;
}

/**
 * Admin refunds a paid event purchase.
 *
 * Guards:
 * - Only "paid" purchases can be refunded.
 * - Pending / already-refunded purchases are rejected both here and in the UI.
 */
export async function refundEventPurchaseAction(input: {
  purchaseId: string;
  eventId: string;
  refundReason: string | null;
}): Promise<{ success: boolean; error?: string }> {
  // Finance hardening: this is the BPM-only manual refund path (used
  // for cash/Revolut/at-reception payments that were already refunded
  // outside Stripe). It must NOT be reachable for Stripe-paid purchases
  // — those go through `issueStripeRefundAction`, which actually moves
  // the money. We require the dedicated refund permission rather than
  // the events:edit gate it used historically.
  const guard = await requireAnyPermissionForAction(["finance:refund", "payments:refund"]);
  if (!guard.ok) return { success: false, error: guard.error };
  const user = guard.access.user;

  const repo = getSpecialEventRepo();
  const purchases = await repo.getPurchasesByEvent(input.eventId);
  const purchase = purchases.find((p) => p.id === input.purchaseId);

  if (!purchase) return { success: false, error: "Purchase not found" };

  if (purchase.paymentStatus === "pending") {
    return { success: false, error: "Cannot refund a pending purchase — it was never paid" };
  }
  if (purchase.paymentStatus === "refunded") {
    return { success: false, error: "This purchase has already been refunded" };
  }
  if (purchase.paymentStatus !== "paid") {
    return { success: false, error: `Cannot refund a purchase with status "${purchase.paymentStatus}"` };
  }
  // Stripe-paid purchases MUST go through issueStripeRefundAction so the
  // customer actually gets their money back; refusing them here keeps a
  // mis-clicked "manual refund" button from desynchronising BPM and Stripe.
  if (purchase.paymentMethod === "stripe") {
    return {
      success: false,
      error: "This purchase was paid through Stripe. Use the Issue Stripe refund action instead.",
    };
  }

  const refundedAt = new Date().toISOString();

  const result = await refundPurchase(input.purchaseId, {
    refundedAt,
    refundedBy: user.id,
    refundReason: input.refundReason?.trim() || null,
  });

  if (!result.success) return result;

  logFinanceEvent({
    entityType: "event_purchase",
    entityId: input.purchaseId,
    action: "refunded",
    performer: performerFromUser(user),
    detail: input.refundReason?.trim() || "Admin refund",
    previousValue: "paid",
    newValue: "refunded",
  });

  revalidateEventPaths(input.eventId);

  const isGuest = !purchase.studentId;
  const buyerEmail = isGuest ? purchase.guestEmail : null;
  const buyerName = isGuest ? (purchase.guestName ?? "Guest") : null;

  if (!isGuest && purchase.studentId) {
    const studentRepo = await import("@/lib/repositories").then((m) => m.getStudentRepo());
    const student = await studentRepo.getById(purchase.studentId).catch(() => null);
    sendRefundNotification({
      studentId: purchase.studentId,
      recipientName: student?.fullName ?? "Student",
      directEmail: undefined,
      eventTitle: (await repo.getEventById(input.eventId))?.title ?? "Event",
      eventId: input.eventId,
      productName: purchase.productNameSnapshot ?? "Event product",
      amountCents: purchase.paidAmountCents ?? purchase.originalAmountCents ?? 0,
      currency: purchase.currency ?? "eur",
      refundReason: input.refundReason?.trim() || null,
      purchaseId: input.purchaseId,
    });
  } else if (buyerEmail) {
    sendRefundNotification({
      studentId: null,
      recipientName: buyerName ?? "Guest",
      directEmail: buyerEmail,
      eventTitle: (await repo.getEventById(input.eventId))?.title ?? "Event",
      eventId: input.eventId,
      productName: purchase.productNameSnapshot ?? "Event product",
      amountCents: purchase.paidAmountCents ?? purchase.originalAmountCents ?? 0,
      currency: purchase.currency ?? "eur",
      refundReason: input.refundReason?.trim() || null,
      purchaseId: input.purchaseId,
    });
  }

  return { success: true };
}

function sendRefundNotification(params: {
  studentId: string | null;
  recipientName: string;
  directEmail?: string;
  eventTitle: string;
  eventId: string;
  productName: string;
  amountCents: number;
  currency: string;
  refundReason: string | null;
  purchaseId: string;
}) {
  const amountLabel = `€${(params.amountCents / 100).toFixed(2)}`;

  sendEventRefundEmail({
    studentId: params.studentId,
    recipientName: params.recipientName,
    directEmail: params.directEmail,
    eventTitle: params.eventTitle,
    eventId: params.eventId,
    productName: params.productName,
    amountLabel,
    refundReason: params.refundReason,
  }).then((emailResult) => {
    if (!emailResult.sent) {
      console.warn(`[event-refund] Email not sent for purchase ${params.purchaseId}: ${emailResult.reason}`);
    }
    const repo = getSpecialEventRepo();
    repo.updatePurchaseEmailTracking(params.purchaseId, {
      lastEmailType: "refund_confirmation",
      lastEmailSentAt: new Date().toISOString(),
      lastEmailSuccess: emailResult.sent,
    }).catch(() => {});
  }).catch((err) => {
    console.error("[event-refund] Email send threw:", err instanceof Error ? err.message : err);
  });
}
