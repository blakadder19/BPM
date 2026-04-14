"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getSpecialEventRepo } from "@/lib/repositories";
import { createPurchase, updatePurchasePayment } from "@/lib/services/special-event-service";
import { sendEventPurchaseEmail } from "@/lib/communications/event-emails";
import { generateGuestPurchaseQrToken } from "@/lib/domain/checkin-token";

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
      return { success: false, error: "This event is sold out" };
    }
  }

  const result = await createPurchase({
    studentId: user.id,
    eventProductId: input.eventProductId,
    eventId: input.eventId,
    paymentMethod: "manual",
    paymentStatus: "pending",
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

  if (event.overallCapacity != null) {
    const allPurchases = await repo.getPurchasesByEvent(input.eventId);
    const totalSold = allPurchases.filter((p) => p.paymentStatus !== "refunded").length;
    if (totalSold >= event.overallCapacity) {
      return { success: false, error: "This event is sold out" };
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
): Promise<{ success: boolean; error?: string }> {
  const eventProductId = metadata.bpm_event_product_id;
  const eventId = metadata.bpm_event_id;
  const guestName = metadata.bpm_guest_name;
  const guestEmail = metadata.bpm_guest_email;
  if (!eventProductId || !eventId || !guestEmail) {
    return { success: false, error: "Missing guest event metadata in Stripe session" };
  }

  const paymentRef = `stripe:${sessionId}`;
  const repo = getSpecialEventRepo();

  const allPurchases = await repo.getPurchasesByEvent(eventId);
  const alreadyFulfilled = allPurchases.find((p) => p.paymentReference === paymentRef);
  if (alreadyFulfilled) return { success: true };

  const qrToken = generateGuestPurchaseQrToken();

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
  });

  if (result.success) {
    try {
      const [event, product] = await Promise.all([
        repo.getEventById(eventId).catch(() => null),
        repo.getProductsByEvent(eventId).then((ps) => ps.find((p) => p.id === eventProductId)).catch(() => null),
      ]);
      if (product) {
        sendEventPurchaseEmail({
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
        }).catch((err) => console.warn("[event-purchase] Failed to send guest Stripe purchase email:", err));
      }
    } catch (err) { console.warn("[event-purchase] Failed to resolve guest purchase email data:", err); }
  }

  return result;
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

  const result = await createPurchase({
    studentId,
    eventProductId,
    eventId,
    paymentMethod: "stripe",
    paymentStatus: "paid",
    paymentReference: paymentRef,
  });

  if (result.success) {
    try {
      const [event, product, student] = await Promise.all([
        repo.getEventById(eventId).catch(() => null),
        repo.getProductsByEvent(eventId).then((ps) => ps.find((p) => p.id === eventProductId)).catch(() => null),
        import("@/lib/repositories").then((m) => m.getStudentRepo().getById(studentId)).catch(() => null),
      ]);
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

  return updatePurchasePayment(purchaseId, {
    paymentStatus: "paid",
    paymentReference: paymentRef,
    paidAt: new Date().toISOString(),
  });
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

  const result = await updatePurchasePayment(input.purchaseId, {
    paymentStatus: "paid",
    receptionMethod: input.receptionMethod,
    paidAt: new Date().toISOString(),
    ...(qrToken ? { qrToken } : {}),
  });

  if (result.success) {
    revalidateEventPaths(input.eventId);

    if (isGuestPurchase && purchase.guestEmail) {
      try {
        const [event, product] = await Promise.all([
          repo.getEventById(input.eventId).catch(() => null),
          repo.getProductsByEvent(input.eventId).then((ps) => ps.find((p) => p.id === purchase.eventProductId)).catch(() => null),
        ]);
        if (product) {
          sendEventPurchaseEmail({
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
          }).catch((err) => console.warn("[event-purchase] Failed to send guest paid email:", err));
        }
      } catch (err) { console.warn("[event-purchase] Failed to resolve guest paid email data:", err); }
    }
  }

  return result;
}
