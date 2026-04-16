"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getSpecialEventRepo } from "@/lib/repositories";
import { createPurchase, updatePurchasePayment } from "@/lib/services/special-event-service";
import { sendEventPurchaseEmail, type EmailSendResult } from "@/lib/communications/event-emails";
import { sendPaymentConfirmationEmail } from "@/lib/actions/event-emails";
import { generateGuestPurchaseQrToken } from "@/lib/domain/checkin-token";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";

function centsToEuros(c: number): string {
  return `€${(c / 100).toFixed(2)}`;
}

function buildInclusionSummary(
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

function revalidateEventPaths(eventId: string) {
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/dashboard");
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
  };
}

/**
 * Student purchases an event product with "pay at reception" flow.
 */
export async function createEventPurchaseAction(input: {
  eventProductId: string;
  eventId: string;
}): Promise<{ success: boolean; error?: string }> {
  const user = await requireRole(["student"]);

  const repo = getSpecialEventRepo();
  const product = (await repo.getProductsByEvent(input.eventId)).find(
    (p) => p.id === input.eventProductId,
  );
  if (!product) return { success: false, error: "Event product not found" };
  if (!product.salesOpen) return { success: false, error: "Sales are not open for this product" };

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

  const result = await createPurchase({
    studentId: user.id,
    eventProductId: input.eventProductId,
    eventId: input.eventId,
    paymentMethod: "manual",
    paymentStatus: "pending",
    ...buildFinancialSnapshot(product, false),
  });

  if (result.success) {
    revalidateEventPaths(input.eventId);

    sendEventPurchaseEmail({
      studentId: user.id,
      studentName: user.fullName ?? "Student",
      eventTitle: event.title,
      eventId: input.eventId,
      productName: product.name,
      productType: product.productType,
      priceLabel: centsToEuros(product.priceCents),
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

  const result = await createPurchase({
    studentId: null,
    eventProductId: input.eventProductId,
    eventId: input.eventId,
    guestName,
    guestEmail: email.trim(),
    guestPhone: input.phone?.trim() || null,
    paymentMethod: "manual",
    paymentStatus: "pending",
    ...buildFinancialSnapshot(product, false),
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
      priceLabel: centsToEuros(product.priceCents),
      paymentStatus: "pending",
      inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
      coverImageUrl: event.coverImageUrl ?? undefined,
    }).catch((err) => console.warn("[event-purchase] Failed to send guest purchase email:", err));
  }
  return result;
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
    ...(product ? buildFinancialSnapshot(product, true) : {}),
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
        priceLabel: centsToEuros(product.priceCents),
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

  const [event, product, student] = await Promise.all([
    repo.getEventById(eventId).catch(() => null),
    repo.getProductsByEvent(eventId).then((ps) => ps.find((p) => p.id === eventProductId)).catch(() => null),
    import("@/lib/repositories").then((m) => m.getStudentRepo().getById(studentId)).catch(() => null),
  ]);

  const result = await createPurchase({
    studentId,
    eventProductId,
    eventId,
    paymentMethod: "stripe",
    paymentStatus: "paid",
    paymentReference: paymentRef,
    paidAt: new Date().toISOString(),
    ...(product ? buildFinancialSnapshot(product, true) : {}),
  });

  if (result.success) {
    try {
      if (product) {
        sendEventPurchaseEmail({
          studentId,
          studentName: student?.fullName ?? "Student",
          eventTitle: event?.title ?? "Special Event",
          eventId,
          productName: product.name,
          productType: product.productType,
          priceLabel: centsToEuros(product.priceCents),
          paymentStatus: "paid",
          inclusionSummary: buildInclusionSummary(product.inclusionRule, product.includedSessionIds),
          coverImageUrl: event?.coverImageUrl ?? undefined,
        }).catch((err) => console.warn("[event-purchase] Failed to send Stripe purchase email:", err));
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

/**
 * Admin confirms a pending event purchase as paid at reception.
 * For guest purchases: generates QR and sends confirmation email with QR.
 */
export async function markEventPurchasePaidAction(input: {
  purchaseId: string;
  eventId: string;
  receptionMethod: "cash" | "revolut";
}): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);

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
      performedBy: "admin",
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
