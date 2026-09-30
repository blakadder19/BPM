import "server-only";

/**
 * Trusted event-purchase fulfilment for Stripe-paid sessions.
 *
 * These functions create or mark event purchases as PAID from Stripe session
 * metadata and must never be reachable as Server Actions. They do not check
 * payment status themselves: callers must pass a session that was retrieved
 * from Stripe (or delivered by a signature-verified webhook) with
 * `payment_status === "paid"`. See `routeStripeSessionFulfillment` and
 * `app/event/[id]/checkout-success/page.tsx`.
 */

import { getSpecialEventRepo } from "@/lib/repositories";
import { createPurchase, updatePurchasePayment } from "@/lib/services/special-event-service";
import { sendEventPurchaseEmail, type EmailSendResult } from "@/lib/communications/event-emails";
import { sendPaymentConfirmationEmail } from "@/lib/services/event-payment-email";
import { generateGuestPurchaseQrToken } from "@/lib/domain/checkin-token";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import {
  buildAuditDiscountMetadata,
  type FrozenPricing,
} from "@/lib/services/pricing-service";
import type { AppliedDiscountSnapshot } from "@/lib/domain/pricing-engine";
import {
  toVatSnapshotFields,
  EMPTY_VAT_SNAPSHOT,
} from "@/lib/domain/vat";

export function centsToEuros(c: number): string {
  return `€${(c / 100).toFixed(2)}`;
}

export function buildInclusionSummary(
  inclusionRule: string,
  _includedSessionIds: string[] | null,
): string {
  switch (inclusionRule) {
    case "all_sessions": return "All event sessions";
    case "all_workshops": return "All workshops";
    case "socials_only": return "Social sessions only";
    case "selected_sessions": return "Selected sessions (see event page for details)";
    default: return "";
  }
}

function buildFinancialSnapshot(product: { priceCents: number; name: string; productType: string }, isPaid: boolean) {
  return {
    unitPriceCentsAtPurchase: product.priceCents,
    originalAmountCents: product.priceCents,
    discountAmountCents: 0,
    paidAmountCents: isPaid ? product.priceCents : 0,
    currency: "eur",
    productNameSnapshot: product.name,
    productTypeSnapshot: product.productType,
    appliedDiscount: null as AppliedDiscountSnapshot | null,
    // No pricing result available on this path, so no VAT was
    // evaluated — record nulls rather than inventing a zero split.
    ...EMPTY_VAT_SNAPSHOT,
  };
}

/**
 * Rehydrate a financial snapshot from a frozen Stripe-metadata pricing
 * payload. Falls back to the live product price when the session carried
 * no pricing snapshot (e.g. older sessions, or full-price purchases
 * that never went through the engine).
 */
function buildFinancialSnapshotFromFrozen(
  product: { priceCents: number; name: string; productType: string },
  frozen: FrozenPricing | null,
  isPaid: boolean,
) {
  if (!frozen) return buildFinancialSnapshot(product, isPaid);
  const vat = frozen.vat;
  const payable = vat?.vatApplied ? vat.totalIncVatCents : frozen.finalPriceCents;
  return {
    unitPriceCentsAtPurchase: frozen.basePriceCents,
    originalAmountCents: frozen.basePriceCents,
    discountAmountCents: frozen.totalDiscountCents,
    paidAmountCents: isPaid ? payable : 0,
    currency: "eur",
    productNameSnapshot: product.name,
    productTypeSnapshot: product.productType,
    appliedDiscount: frozen.snapshot,
    ...(vat?.vatApplied ? toVatSnapshotFields(vat) : EMPTY_VAT_SNAPSHOT),
  };
}

/**
 * Rebuild the frozen pricing a Stripe session was created with.
 *
 * Handles three cases that the raw `deserializePricingFromStripe` call
 * does not cover on its own:
 *
 *   1. Discount applied  → the compact transit blob is present; VAT is
 *      merged in from the flat `bpm_vat_*` keys.
 *   2. Full price + VAT  → no transit blob (it is only written when a
 *      discount applied), but VAT keys ARE present. Without this
 *      branch a full-price VAT ticket would fulfil with no VAT
 *      recorded, which is the majority case once VAT is enabled.
 *   3. Neither           → null, and the caller falls back to the live
 *      product price, exactly as before VAT existed.
 *
 * VAT is never recomputed here: a rate change between session creation
 * and payment must not alter what the customer was charged.
 */
async function rehydrateFrozenPricing(
  metadata: Record<string, string>,
  fallbackPriceCents: number,
): Promise<FrozenPricing | null> {
  const { deserializePricingFromStripe, readVatFromStripeMetadata } = await import(
    "@/lib/services/pricing-service"
  );

  const rawPricing = metadata.bpm_pricing_snapshot;
  if (rawPricing) {
    const restored = await deserializePricingFromStripe(rawPricing, metadata);
    if (restored) return restored;
  }

  const vatOnly = readVatFromStripeMetadata(metadata, fallbackPriceCents);
  if (vatOnly.vatApplied) {
    return {
      basePriceCents: vatOnly.subtotalExVatCents,
      totalDiscountCents: 0,
      finalPriceCents: vatOnly.subtotalExVatCents,
      appliedDiscounts: [],
      snapshot: null,
      vat: vatOnly,
    };
  }

  return null;
}

/**
 * Webhook fulfillment for guest event purchases paid via Stripe.
 * Generates QR immediately since payment is already confirmed.
 */
export async function fulfillGuestEventPurchase(
  sessionId: string,
  metadata: Record<string, string>,
): Promise<{ success: boolean; error?: string; emailResult?: EmailSendResult }> {
  const tag = `[guest-fulfill session=${sessionId}]`;
  const eventProductId = metadata.bpm_event_product_id;
  const eventId = metadata.bpm_event_id;
  const guestName = metadata.bpm_guest_name;
  const guestEmail = metadata.bpm_guest_email;

  console.info(`${tag} Starting. event=${eventId} product=${eventProductId} guest=${guestEmail}`);

  if (!eventProductId || !eventId || !guestEmail) {
    console.error(`${tag} Missing metadata: eventProductId=${eventProductId} eventId=${eventId} guestEmail=${guestEmail}`);
    return { success: false, error: "Missing guest event metadata in Stripe session" };
  }

  const paymentRef = `stripe:${sessionId}`;
  const repo = getSpecialEventRepo();

  const allPurchases = await repo.getPurchasesByEvent(eventId);
  const alreadyFulfilled = allPurchases.find((p) => p.paymentReference === paymentRef);
  if (alreadyFulfilled) {
    console.info(`${tag} Already fulfilled (idempotent skip). purchaseId=${alreadyFulfilled.id}`);
    return { success: true, emailResult: { sent: false, reason: "Already fulfilled (email was sent on first fulfillment)" } };
  }

  const qrToken = generateGuestPurchaseQrToken();
  console.info(`${tag} Generated QR token: ${qrToken.slice(0, 8)}...`);

  const [event, product] = await Promise.all([
    repo.getEventById(eventId).catch(() => null),
    repo.getProductsByEvent(eventId).then((ps) => ps.find((p) => p.id === eventProductId)).catch(() => null),
  ]);

  // Phase 5 — rehydrate the frozen pricing snapshot the guest Stripe
  // checkout action stuffed into Stripe metadata. Mirrors the
  // student-side path so promo codes used by guests persist a frozen
  // `applied_discount` snapshot on the purchase row.
  // Phase 15 — also rehydrates the frozen VAT breakdown.
  const frozen = await rehydrateFrozenPricing(metadata, product?.priceCents ?? 0);

  const result = await createPurchase({
    studentId: null,
    eventProductId,
    eventId,
    guestName: guestName ?? "Guest",
    guestEmail,
    guestPhone: metadata.bpm_guest_phone || null,
    qrToken,
    paymentMethod: "stripe",
    paymentStatus: "paid",
    paymentReference: paymentRef,
    paidAt: new Date().toISOString(),
    ...(product
      ? buildFinancialSnapshotFromFrozen(product, frozen, true)
      : {}),
  });

  if (!result.success) {
    console.error(`${tag} createPurchase FAILED: ${result.error}`);
    return result;
  }

  console.info(`${tag} Purchase created successfully. Sending confirmation email...`);

  let emailResult: EmailSendResult = { sent: false, reason: "Email send was not attempted" };

  try {
    if (product) {
      emailResult = await sendEventPurchaseEmail({
        studentId: null,
        studentName: guestName ?? "Guest",
        directEmail: guestEmail,
        eventTitle: event?.title ?? "Special Event",
        eventId,
        productName: product.name,
        productType: product.productType,
        priceLabel: centsToEuros(frozen?.finalPriceCents ?? product.priceCents),
        paymentStatus: "paid",
        inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
        qrToken,
        coverImageUrl: event?.coverImageUrl ?? undefined,
      });
      console.info(`${tag} Email result: sent=${emailResult.sent}${!emailResult.sent ? ` reason="${emailResult.reason}"` : ""}`);
    } else {
      emailResult = { sent: false, reason: `Could not resolve product ${eventProductId}` };
      console.warn(`${tag} ${emailResult.reason} — email skipped.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emailResult = { sent: false, reason: `Email send threw: ${msg}` };
    console.error(`${tag} ${emailResult.reason}`);
  }

  return { ...result, emailResult };
}

/**
 * Webhook fulfillment: marks an event purchase as paid after Stripe confirms.
 */
export async function fulfillEventPurchase(
  sessionId: string,
  metadata: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const eventProductId = metadata.bpm_event_product_id;
  const eventId = metadata.bpm_event_id;
  const studentId = metadata.bpm_student_id;
  if (!eventProductId || !eventId || !studentId) {
    return { success: false, error: "Missing event metadata in Stripe session" };
  }

  const paymentRef = `stripe:${sessionId}`;
  const repo = getSpecialEventRepo();

  const existing = await repo.getPurchasesByStudent(studentId);
  const alreadyFulfilled = existing.find((p) => p.paymentReference === paymentRef);
  if (alreadyFulfilled) return { success: true };

  // Rehydrate the frozen pricing snapshot the checkout action stuffed
  // into Stripe metadata. This is what makes pricing tamper-proof: the
  // webhook NEVER re-runs the engine — it persists exactly what was
  // calculated when the session was opened, even if the rule was
  // edited or deleted in the interim.
  const [event, product, student] = await Promise.all([
    repo.getEventById(eventId).catch(() => null),
    repo.getProductsByEvent(eventId).then((ps) => ps.find((p) => p.id === eventProductId)).catch(() => null),
    import("@/lib/repositories").then((m) => m.getStudentRepo().getById(studentId)).catch(() => null),
  ]);

  // Phase 15 — rehydrates the VAT breakdown alongside the discount
  // snapshot, and covers full-price-with-VAT sessions that carry no
  // discount blob at all.
  const frozen = await rehydrateFrozenPricing(metadata, product?.priceCents ?? 0);

  const snapshot = product
    ? buildFinancialSnapshotFromFrozen(product, frozen, true)
    : {};

  const result = await createPurchase({
    studentId,
    eventProductId,
    eventId,
    paymentMethod: "stripe",
    paymentStatus: "paid",
    paymentReference: paymentRef,
    paidAt: new Date().toISOString(),
    ...snapshot,
  });

  if (result.success) {
    try {
      if (product) {
        const paidLabel = centsToEuros(
          frozen?.finalPriceCents ?? product.priceCents,
        );
        sendEventPurchaseEmail({
          studentId,
          studentName: student?.fullName ?? "Student",
          eventTitle: event?.title ?? "Special Event",
          eventId,
          productName: product.name,
          productType: product.productType,
          priceLabel: paidLabel,
          paymentStatus: "paid",
          inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
          coverImageUrl: event?.coverImageUrl ?? undefined,
        }).catch((err) => console.warn("[event-purchase] Failed to send Stripe purchase email:", err));

        if (frozen && frozen.totalDiscountCents > 0 && result.data) {
          try {
            logFinanceEvent({
              entityType: "event_purchase",
              entityId: result.data,
              action: "created",
              detail: `Stripe session ${sessionId} fulfilled with discount`,
              newValue: paidLabel,
              metadata: {
                ...(buildAuditDiscountMetadata(frozen) ?? {}),
                kind: "event_purchase_discounted",
                source: "stripe_webhook",
              },
            });
          } catch (e) {
            console.warn(
              "[event-purchase] failed to log webhook discount metadata:",
              e instanceof Error ? e.message : e,
            );
          }
        }
      }
    } catch (err) { console.warn("[event-purchase] Failed to resolve purchase email data:", err); }
  }

  return result;
}

/**
 * Student pays for a pending event purchase via Stripe (after webhook confirmation).
 */
export async function fulfillPendingEventPurchase(
  sessionId: string,
  metadata: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const purchaseId = metadata.bpm_event_purchase_id;
  if (!purchaseId) return { success: false, error: "Missing purchase ID in metadata" };

  const paymentRef = `stripe:${sessionId}`;

  const repo = getSpecialEventRepo();
  const eventId = metadata.bpm_event_id;
  let paidAmountCents: number | undefined;
  if (eventId) {
    const purchases = await repo.getPurchasesByEvent(eventId);
    const purchase = purchases.find((p) => p.id === purchaseId);
    if (purchase?.originalAmountCents != null) {
      paidAmountCents = purchase.originalAmountCents - (purchase.discountAmountCents ?? 0);
    }
  }

  const result = await updatePurchasePayment(purchaseId, {
    paymentStatus: "paid",
    paymentReference: paymentRef,
    paidAt: new Date().toISOString(),
    ...(paidAmountCents != null ? { paidAmountCents } : {}),
  });

  if (result.success) {
    logFinanceEvent({
      entityType: "event_purchase",
      entityId: purchaseId,
      action: "marked_paid",
      detail: `Stripe session ${sessionId}`,
      previousValue: "pending",
      newValue: "paid",
    });

    if (eventId) {
      sendPaymentConfirmationEmail(purchaseId, eventId).catch((err) =>
        console.error("[event-purchase] Post-payment email threw:", err instanceof Error ? err.message : err),
      );
    }
  }

  return result;
}
