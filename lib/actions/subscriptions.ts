"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import { getProductRepo, getTermRepo, getSubscriptionRepo, getStudentRepo } from "@/lib/repositories";
import { getNextConsecutiveTerm } from "@/lib/domain/term-rules";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getBookingService } from "@/lib/services/booking-store";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import { getTodayStr } from "@/lib/domain/datetime";
import { paymentPendingEvent, paymentConfirmedEvent, subscriptionRefundedEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import type { PaymentMethod, SalePaymentStatus, ProductType, SubscriptionStatus } from "@/types/domain";

const VALID_STATUSES = new Set<string>([
  "active",
  "paused",
  "expired",
  "exhausted",
  "cancelled",
]);

const VALID_PAYMENT_METHODS = new Set<string>([
  "stripe",
  "cash",
  "card",
  "bank_transfer",
  "revolut",
  "manual",
  "complimentary",
]);

const VALID_PAYMENT_STATUSES = new Set<string>([
  "paid",
  "pending",
  "complimentary",
  "waived",
  "cancelled",
  "refunded",
]);

function parseCredits(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? null : n;
}

export async function createSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string; subscriptionId?: string }> {
  const adminUser = await requireRole(["admin"]);
  const studentId = formData.get("studentId") as string;
  const productId = (formData.get("productId") as string)?.trim();
  const termId = (formData.get("termId") as string)?.trim() || null;
  const paymentMethodRaw = (formData.get("paymentMethod") as string)?.trim();
  const paymentStatusRaw = (formData.get("paymentStatus") as string)?.trim() || "paid";
  const autoRenew = formData.get("autoRenew") === "on" || formData.get("autoRenew") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const selectedStyleId = (formData.get("selectedStyleId") as string)?.trim() || null;
  const selectedStyleName = (formData.get("selectedStyleName") as string)?.trim() || null;

  let selectedStyleIds: string[] | null = null;
  let selectedStyleNames: string[] | null = null;
  const rawIds = formData.get("selectedStyleIds") as string;
  const rawNames = formData.get("selectedStyleNames") as string;
  if (rawIds) {
    try { selectedStyleIds = JSON.parse(rawIds); } catch { /* ignore */ }
  }
  if (rawNames) {
    try { selectedStyleNames = JSON.parse(rawNames); } catch { /* ignore */ }
  }

  if (!studentId) return { success: false, error: "Missing student ID" };
  if (!productId) return { success: false, error: "Please select a product" };
  if (!paymentMethodRaw || !VALID_PAYMENT_METHODS.has(paymentMethodRaw)) {
    return { success: false, error: "Invalid payment method" };
  }
  if (!VALID_PAYMENT_STATUSES.has(paymentStatusRaw)) {
    return { success: false, error: "Invalid payment status" };
  }

  const product = await getProductRepo().getById(productId);
  if (!product) return { success: false, error: "Product not found" };

  let validFrom: string;
  let validUntil: string | null;

  if (termId) {
    const term = await getTermRepo().getById(termId);
    if (!term) return { success: false, error: "Term not found" };
    validFrom = term.startDate;
    validUntil = term.endDate;

    const spanTerms = product.spanTerms ?? 1;
    if (spanTerms >= 2) {
      const allTerms = await getTermRepo().getAll();
      const nextTerm = getNextConsecutiveTerm(allTerms, termId);
      if (!nextTerm) {
        return {
          success: false,
          error: `Cannot assign — no next consecutive term exists after "${term.name}". Please create the next term first.`,
        };
      }
      validUntil = nextTerm.endDate;
    }
  } else if (product.durationDays) {
    const today = new Date().toISOString().slice(0, 10);
    validFrom = today;
    const end = new Date();
    end.setDate(end.getDate() + product.durationDays);
    validUntil = end.toISOString().slice(0, 10);
  } else {
    validFrom = new Date().toISOString().slice(0, 10);
    validUntil = null;
  }

  const totalCredits = product.totalCredits;
  const remainingCredits = product.totalCredits;
  const classesPerTerm = product.classesPerTerm;

  const result = await createSubscription({
    studentId,
    productId: product.id,
    productName: product.name,
    productType: product.productType,
    status: "active",
    totalCredits,
    remainingCredits,
    validFrom,
    validUntil,
    notes,
    termId,
    paymentMethod: paymentMethodRaw as PaymentMethod,
    paymentStatus: paymentStatusRaw as SalePaymentStatus,
    assignedBy: adminUser.id,
    assignedAt: new Date().toISOString(),
    autoRenew,
    classesUsed: 0,
    classesPerTerm,
    selectedStyleId,
    selectedStyleName,
    selectedStyleIds,
    selectedStyleNames,
    priceCentsAtPurchase: product.priceCents,
    currencyAtPurchase: "EUR",
  });

  if (result.success && result.subscriptionId && paymentStatusRaw === "pending") {
    const student = await getStudentRepo().getById(studentId);
    if (student) {
      const term = termId ? await getTermRepo().getById(termId) : null;
      await dispatchCommEvents([
        paymentPendingEvent({
          studentId,
          studentName: student.fullName,
          productName: product.name,
          subscriptionId: result.subscriptionId,
          termName: term?.name ?? null,
          amountLabel: product.priceCents != null ? `€${(product.priceCents / 100).toFixed(2)}` : null,
        }),
      ]);
    }
  }

  if (result.success) {
    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }
  return result;
}

export async function updateSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = formData.get("id") as string;
  const statusRaw = formData.get("status") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const paymentMethodRaw = (formData.get("paymentMethod") as string)?.trim() || null;
  const paymentStatusRaw = (formData.get("paymentStatus") as string)?.trim() || null;

  if (!id) return { success: false, error: "Missing subscription ID" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };
  if (paymentMethodRaw && !VALID_PAYMENT_METHODS.has(paymentMethodRaw)) {
    return { success: false, error: "Invalid payment method" };
  }
  if (paymentStatusRaw && !VALID_PAYMENT_STATUSES.has(paymentStatusRaw)) {
    return { success: false, error: "Invalid payment status" };
  }

  if (paymentStatusRaw === "refunded") {
    const existing = await getSubscriptionRepo().getById(id);
    if (existing && existing.paymentStatus !== "paid") {
      return {
        success: false,
        error: "Only paid items can be refunded. A pending payment was never received.",
      };
    }
  }

  const patch: Parameters<typeof updateSubscription>[1] = {
    status: statusRaw as SubscriptionStatus,
    notes,
  };

  if (paymentMethodRaw) patch.paymentMethod = paymentMethodRaw as PaymentMethod;
  if (paymentStatusRaw) patch.paymentStatus = paymentStatusRaw as SalePaymentStatus;

  const selectedStyleId = formData.get("selectedStyleId") as string | null;
  const selectedStyleName = formData.get("selectedStyleName") as string | null;
  if (selectedStyleId !== null) {
    patch.selectedStyleId = selectedStyleId || null;
    patch.selectedStyleName = selectedStyleName || null;
  }

  const rawStyleIds = formData.get("selectedStyleIds") as string | null;
  const rawStyleNames = formData.get("selectedStyleNames") as string | null;
  if (rawStyleIds !== null) {
    try { patch.selectedStyleIds = JSON.parse(rawStyleIds); } catch { /* ignore */ }
  }
  if (rawStyleNames !== null) {
    try { patch.selectedStyleNames = JSON.parse(rawStyleNames); } catch { /* ignore */ }
  }

  const paidAtRaw = (formData.get("paidAt") as string | null)?.trim() || null;
  const paymentReference = (formData.get("paymentReference") as string | null)?.trim() || null;
  const paymentNotes = (formData.get("paymentNotes") as string | null)?.trim() || null;
  const collectedBy = (formData.get("collectedBy") as string | null)?.trim() || null;

  if (paidAtRaw) {
    const d = new Date(paidAtRaw);
    patch.paidAt = isNaN(d.getTime()) ? null : d.toISOString();
  } else {
    patch.paidAt = null;
  }
  patch.paymentReference = paymentReference;
  patch.paymentNotes = paymentNotes;
  patch.collectedBy = collectedBy;

  const result = await updateSubscription(id, patch);

  if (result.success) {
    if (paymentStatusRaw === "paid") {
      try {
        const sub = await getSubscriptionRepo().getById(id);
        if (sub) {
          const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
          await dismissNotificationsForSubscription(sub.studentId, id);

          const student = await getStudentRepo().getById(sub.studentId);
          if (student) {
            const amountLabel = sub.priceCentsAtPurchase != null
              ? `€${(sub.priceCentsAtPurchase / 100).toFixed(2)}`
              : null;
            await dispatchCommEvents([
              paymentConfirmedEvent({
                studentId: sub.studentId,
                studentName: student.fullName,
                productName: sub.productName,
                subscriptionId: id,
                amountLabel,
                paymentMethod: sub.paymentMethod,
              }),
            ]).catch(() => {});
          }
        }
      } catch { /* best-effort */ }
    }
    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
  }
  return result;
}

// ── Payment impact check ─────────────────────────────────────

export interface PaymentChangeImpact {
  futureBookingsCount: number;
  subscriptionStatus: SubscriptionStatus;
  productName: string;
}

/**
 * Check the impact of cancelling an entitlement linked to this subscription.
 */
export async function checkPaymentChangeImpactAction(
  subscriptionId: string
): Promise<{ success: boolean; impact?: PaymentChangeImpact; error?: string }> {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();

  const sub = (await getSubscriptionRepo().getAll()).find((s) => s.id === subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };

  const today = getTodayStr();
  const svc = getBookingService();
  const futureBookings = svc.bookings.filter((b) => {
    if (b.studentId !== sub.studentId) return false;
    if (b.subscriptionId !== sub.id) return false;
    if (b.status !== "confirmed" && b.status !== "checked_in") return false;
    const cls = svc.getClass(b.bookableClassId);
    return cls ? cls.date >= today : false;
  });

  return {
    success: true,
    impact: {
      futureBookingsCount: futureBookings.length,
      subscriptionStatus: sub.status,
      productName: sub.productName,
    },
  };
}

/**
 * Apply a sensitive payment status change with optional entitlement cancellation.
 * Called from the confirmation modal after the admin has chosen what to do.
 *
 * Enforced transition rules:
 * - "refunded" is only allowed from "paid" (a pending item was never paid)
 * - "cancelled" is allowed from "pending" or "paid"
 */
export async function applyPaymentChangeAction(params: {
  subscriptionId: string;
  newPaymentStatus: SalePaymentStatus;
  cancelEntitlement: boolean;
  refundReason?: string;
  performedBy?: string;
}): Promise<{ success: boolean; error?: string }> {
  const admin = await requireRole(["admin"]);

  const sub = await getSubscriptionRepo().getById(params.subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };

  const previousStatus = sub.paymentStatus;

  if (params.newPaymentStatus === "refunded" && previousStatus !== "paid") {
    return {
      success: false,
      error: "Only paid items can be refunded. A pending payment was never received.",
    };
  }

  const patch: Parameters<typeof updateSubscription>[1] = {
    paymentStatus: params.newPaymentStatus,
  };

  if (params.cancelEntitlement) {
    patch.status = "cancelled";
  }

  if (params.newPaymentStatus === "refunded") {
    patch.refundedAt = new Date().toISOString();
    patch.refundedBy = params.performedBy ?? admin.fullName ?? admin.email;
    patch.refundReason = params.refundReason ?? null;
  }

  const result = await updateSubscription(params.subscriptionId, patch);

  if (result.success) {
    const action = params.newPaymentStatus === "refunded"
      ? "refunded" as const
      : params.newPaymentStatus === "paid"
        ? "marked_paid" as const
        : "status_changed" as const;

    logFinanceEvent({
      entityType: "subscription",
      entityId: params.subscriptionId,
      action,
      performer: { userId: admin.id, email: admin.email, name: admin.fullName },
      performedBy: params.performedBy,
      detail: params.refundReason ?? null,
      previousValue: previousStatus,
      newValue: params.newPaymentStatus,
    });

    // Notify the student about the payment state change
    try {
      const updatedSub = await getSubscriptionRepo().getById(params.subscriptionId);
      if (updatedSub) {
        const student = await getStudentRepo().getById(updatedSub.studentId);
        const amountLabel = updatedSub.priceCentsAtPurchase != null
          ? `€${(updatedSub.priceCentsAtPurchase / 100).toFixed(2)}`
          : null;

        if (params.newPaymentStatus === "paid" && student) {
          await dispatchCommEvents([
            paymentConfirmedEvent({
              studentId: updatedSub.studentId,
              studentName: student.fullName,
              productName: updatedSub.productName,
              subscriptionId: params.subscriptionId,
              amountLabel,
              paymentMethod: updatedSub.paymentMethod,
            }),
          ]).catch(() => {});

          const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
          await dismissNotificationsForSubscription(updatedSub.studentId, params.subscriptionId);
        }

        if (params.newPaymentStatus === "refunded" && student) {
          await dispatchCommEvents([
            subscriptionRefundedEvent({
              studentId: updatedSub.studentId,
              studentName: student.fullName,
              productName: updatedSub.productName,
              subscriptionId: params.subscriptionId,
              amountLabel,
              refundReason: params.refundReason ?? null,
              entitlementCancelled: params.cancelEntitlement,
            }),
          ]).catch(() => {});
        }
      }
    } catch { /* best-effort notification */ }

    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    revalidatePath("/classes");
    revalidatePath("/bookings");
    revalidatePath("/finance");
  }
  return result;
}
