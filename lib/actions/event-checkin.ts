"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getSpecialEventRepo, getStudentRepo } from "@/lib/repositories";
import { updatePurchaseCheckIn, updatePurchasePayment } from "@/lib/services/special-event-service";
import { isValidStudentQrToken, isValidGuestPurchaseQrToken } from "@/lib/domain/checkin-token";
import { classifyQrToken } from "@/lib/domain/qr-resolver";
import { generateGuestPurchaseQrToken } from "@/lib/domain/checkin-token";
import { isWithinEventCheckInWindow } from "@/lib/domain/datetime";
import { sendPaymentConfirmationEmail } from "@/lib/actions/event-emails";
import type { MockSpecialEvent, MockEventPurchase, MockEventProduct } from "@/lib/mock-data";

// ── Types ────────────────────────────────────────────────────

export interface EventCheckInResult {
  success: boolean;
  error?: string;
}

export type EventEntryStatus = "valid" | "pending_payment" | "already_checked_in" | "auto_checked_in" | "refunded" | "invalid";

export interface EventQrPurchaseInfo {
  purchaseId: string;
  personName: string;
  personEmail: string;
  personType: "student" | "guest";
  productName: string;
  productType: string;
  paymentStatus: string;
  checkedInAt: string | null;
  entryStatus: EventEntryStatus;
  eventId: string;
  eventTitle: string;
  originalAmountCents: number | null;
}

export interface EventQrLookupResult {
  success: boolean;
  error?: string;
  personName?: string;
  personEmail?: string;
  personType?: "student" | "guest";
  purchases?: EventQrPurchaseInfo[];
}

// ── Helpers ──────────────────────────────────────────────────

function isWithinEventWindow(event: MockSpecialEvent): boolean {
  return isWithinEventCheckInWindow(event.startDate, event.endDate);
}

function deriveEntryStatus(p: MockEventPurchase, autoCheckedIn: boolean): EventEntryStatus {
  if (p.paymentStatus === "refunded") return "refunded";
  if (autoCheckedIn) return "auto_checked_in";
  if (p.checkedInAt) return "already_checked_in";
  if (p.paymentStatus === "pending") return "pending_payment";
  if (p.paymentStatus === "paid") return "valid";
  return "invalid";
}

function buildPurchaseInfo(
  p: MockEventPurchase,
  personName: string,
  personEmail: string,
  personType: "student" | "guest",
  eventTitle: string,
  product: MockEventProduct | undefined,
  autoCheckedIn = false,
): EventQrPurchaseInfo {
  return {
    purchaseId: p.id,
    personName,
    personEmail,
    personType,
    productName: p.productNameSnapshot ?? product?.name ?? "Unknown product",
    productType: p.productTypeSnapshot ?? product?.productType ?? "other",
    paymentStatus: autoCheckedIn ? "paid" : p.paymentStatus,
    checkedInAt: autoCheckedIn ? new Date().toISOString() : p.checkedInAt,
    entryStatus: deriveEntryStatus(p, autoCheckedIn),
    eventId: p.eventId,
    eventTitle,
    originalAmountCents: p.originalAmountCents,
  };
}

async function requireStaff() {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return null;
  }
  return user;
}

function revalidateEvent(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/operations`);
}

// ── Event QR Lookup (scoped to a specific event) ─────────────
// For paid + not-checked-in purchases, auto-check-in is performed.

/**
 * Core event QR lookup — accepts a pre-authenticated userId.
 * Exported for use by `processPairedScanAction`; UI-facing callers
 * should use `eventQrLookupAction` which wraps this with auth.
 */
export async function eventQrLookup(
  token: string,
  eventId: string,
  userId: string,
): Promise<EventQrLookupResult> {
  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(eventId);
  if (!event) return { success: false, error: "Event not found" };

  const canCheckIn = isWithinEventWindow(event);
  const products = await repo.getProductsByEvent(eventId);
  const productMap = new Map(products.map((p) => [p.id, p]));

  async function autoCheckInIfEligible(purchase: MockEventPurchase): Promise<boolean> {
    if (!canCheckIn) return false;
    if (purchase.paymentStatus !== "paid" || purchase.checkedInAt) return false;
    const result = await updatePurchaseCheckIn(purchase.id, {
      checkedInAt: new Date().toISOString(),
      checkedInBy: userId,
    });
    if (result.success) revalidateEvent(eventId);
    return result.success;
  }

  const tokenType = classifyQrToken(token);

  if (tokenType === "event_guest") {
    const purchase = await repo.getPurchaseByQrToken(token);
    if (!purchase) return { success: false, error: "No purchase found for this QR code" };
    if (purchase.eventId !== eventId) {
      return { success: false, error: "This QR belongs to a different event" };
    }

    const wasAutoCheckedIn = await autoCheckInIfEligible(purchase);
    const name = purchase.guestName ?? "Guest";
    const email = purchase.guestEmail ?? "";
    return {
      success: true,
      personName: name,
      personEmail: email,
      personType: "guest",
      purchases: [buildPurchaseInfo(purchase, name, email, "guest", event.title, productMap.get(purchase.eventProductId), wasAutoCheckedIn)],
    };
  }

  if (tokenType === "student") {
    const allStudents = await getStudentRepo().getAll();
    const student = allStudents.find((s) => s.qrToken === token);
    if (!student) return { success: false, error: "Student not found for this QR code" };

    const allPurchases = await repo.getPurchasesByEvent(eventId);
    const studentPurchases = allPurchases.filter(
      (p) => p.studentId === student.id && p.paymentStatus !== "refunded",
    );

    if (studentPurchases.length === 0) {
      return { success: false, error: `${student.fullName} has no purchases for this event` };
    }

    const infos: EventQrPurchaseInfo[] = [];
    for (const p of studentPurchases) {
      const wasAutoCheckedIn = await autoCheckInIfEligible(p);
      infos.push(buildPurchaseInfo(p, student.fullName, student.email, "student", event.title, productMap.get(p.eventProductId), wasAutoCheckedIn));
    }

    return {
      success: true,
      personName: student.fullName,
      personEmail: student.email,
      personType: "student",
      purchases: infos,
    };
  }

  return { success: false, error: "Invalid QR code format" };
}

export async function eventQrLookupAction(
  token: string,
  eventId: string,
): Promise<EventQrLookupResult> {
  const user = await requireStaff();
  if (!user) return { success: false, error: "Not authorized" };
  return eventQrLookup(token, eventId, user.id);
}

// ── Check In ─────────────────────────────────────────────────

export async function eventCheckInAction(purchaseId: string, eventId: string): Promise<EventCheckInResult> {
  const user = await requireStaff();
  if (!user) return { success: false, error: "Not authorized" };

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(eventId);
  if (!event) return { success: false, error: "Event not found" };
  if (!isWithinEventWindow(event)) return { success: false, error: "Check-in is only available during the event" };

  const purchases = await repo.getPurchasesByEvent(eventId);
  const purchase = purchases.find((p) => p.id === purchaseId);

  if (!purchase) return { success: false, error: "Purchase not found" };
  if (purchase.paymentStatus === "refunded") return { success: false, error: "Cannot check in a refunded purchase" };
  if (purchase.paymentStatus === "pending") return { success: false, error: "Payment is pending — collect payment before granting entry" };
  if (purchase.checkedInAt) return { success: false, error: "Already checked in" };

  const result = await updatePurchaseCheckIn(purchaseId, {
    checkedInAt: new Date().toISOString(),
    checkedInBy: user.id,
  });

  if (result.success) revalidateEvent(eventId);
  return result;
}

// ── Undo Check In ────────────────────────────────────────────

export async function eventUndoCheckInAction(purchaseId: string, eventId: string): Promise<EventCheckInResult> {
  const user = await requireStaff();
  if (!user) return { success: false, error: "Not authorized" };

  const repo = getSpecialEventRepo();
  const purchases = await repo.getPurchasesByEvent(eventId);
  const purchase = purchases.find((p) => p.id === purchaseId);

  if (!purchase) return { success: false, error: "Purchase not found" };
  if (!purchase.checkedInAt) return { success: false, error: "Not checked in" };

  const result = await updatePurchaseCheckIn(purchaseId, {
    checkedInAt: null,
    checkedInBy: null,
  });

  if (result.success) revalidateEvent(eventId);
  return result;
}

// ── Collect Payment & Check In ───────────────────────────────

export async function eventCollectPaymentAndCheckInAction(input: {
  purchaseId: string;
  eventId: string;
  receptionMethod: "cash" | "revolut";
}): Promise<EventCheckInResult> {
  const user = await requireStaff();
  if (!user) return { success: false, error: "Not authorized" };

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(input.eventId);
  if (!event) return { success: false, error: "Event not found" };
  if (!isWithinEventWindow(event)) return { success: false, error: "Check-in is only available during the event" };

  const purchases = await repo.getPurchasesByEvent(input.eventId);
  const purchase = purchases.find((p) => p.id === input.purchaseId);

  if (!purchase) return { success: false, error: "Purchase not found" };
  if (purchase.paymentStatus === "paid") return { success: false, error: "Purchase is already paid" };
  if (purchase.paymentStatus === "refunded") return { success: false, error: "Cannot process a refunded purchase" };

  const isGuestPurchase = !purchase.studentId;
  const qrToken = isGuestPurchase ? generateGuestPurchaseQrToken() : undefined;

  const paidAmountCents = purchase.originalAmountCents != null
    ? purchase.originalAmountCents - (purchase.discountAmountCents ?? 0)
    : null;

  const payResult = await updatePurchasePayment(input.purchaseId, {
    paymentStatus: "paid",
    receptionMethod: input.receptionMethod,
    paidAt: new Date().toISOString(),
    ...(qrToken ? { qrToken } : {}),
    ...(paidAmountCents != null ? { paidAmountCents } : {}),
  });

  if (!payResult.success) return { success: false, error: payResult.error ?? "Failed to record payment" };

  const checkInResult = await updatePurchaseCheckIn(input.purchaseId, {
    checkedInAt: new Date().toISOString(),
    checkedInBy: user.id,
  });

  try {
    const { logFinanceEvent } = await import("@/lib/services/finance-audit-log");
    logFinanceEvent({
      entityType: "event_purchase",
      entityId: input.purchaseId,
      action: "marked_paid",
      performer: { userId: user.id, email: user.email, name: user.fullName },
      detail: `Reception collected — ${input.receptionMethod}`,
      previousValue: purchase.paymentStatus,
      newValue: "paid",
    });
  } catch { /* best-effort */ }

  sendPaymentConfirmationEmail(input.purchaseId, input.eventId, qrToken).catch((err) =>
    console.error("[event-checkin] Post-payment email threw:", err instanceof Error ? err.message : err),
  );

  revalidateEvent(input.eventId);
  return checkInResult;
}
