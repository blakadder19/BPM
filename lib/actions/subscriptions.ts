"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import { getProductRepo, getTermRepo } from "@/lib/repositories";
import { getNextConsecutiveTerm } from "@/lib/domain/term-rules";
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
]);

function parseCredits(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? null : n;
}

export async function createSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
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
    assignedBy: null,
    assignedAt: new Date().toISOString(),
    autoRenew,
    classesUsed: 0,
    classesPerTerm,
    selectedStyleId,
    selectedStyleName,
    selectedStyleIds,
    selectedStyleNames,
  });

  if (result.success) revalidatePath("/students");
  return result;
}

export async function updateSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = formData.get("id") as string;
  const statusRaw = formData.get("status") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!id) return { success: false, error: "Missing subscription ID" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };

  const patch: Parameters<typeof updateSubscription>[1] = {
    status: statusRaw as SubscriptionStatus,
    notes,
  };

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

  const result = await updateSubscription(id, patch);

  if (result.success) revalidatePath("/students");
  return result;
}
