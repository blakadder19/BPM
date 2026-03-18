"use server";

import { revalidatePath } from "next/cache";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import { getProduct } from "@/lib/services/product-store";
import { getTerm } from "@/lib/services/term-store";
import type { PaymentMethod, ProductType, SubscriptionStatus } from "@/types/domain";

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
  "bank_transfer",
  "manual",
  "complimentary",
]);

function parseCredits(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? null : n;
}

export async function createSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const studentId = formData.get("studentId") as string;
  const productId = (formData.get("productId") as string)?.trim();
  const termId = (formData.get("termId") as string)?.trim() || null;
  const paymentMethodRaw = (formData.get("paymentMethod") as string)?.trim();
  const autoRenew = formData.get("autoRenew") === "on" || formData.get("autoRenew") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const selectedStyleId = (formData.get("selectedStyleId") as string)?.trim() || null;
  const selectedStyleName = (formData.get("selectedStyleName") as string)?.trim() || null;

  if (!studentId) return { success: false, error: "Missing student ID" };
  if (!productId) return { success: false, error: "Please select a product" };
  if (!paymentMethodRaw || !VALID_PAYMENT_METHODS.has(paymentMethodRaw)) {
    return { success: false, error: "Invalid payment method" };
  }

  const product = getProduct(productId);
  if (!product) return { success: false, error: "Product not found" };

  let validFrom: string;
  let validUntil: string | null;

  if (termId) {
    const term = getTerm(termId);
    if (!term) return { success: false, error: "Term not found" };
    validFrom = term.startDate;
    validUntil = term.endDate;
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
    autoRenew,
    classesUsed: 0,
    classesPerTerm,
    selectedStyleId,
    selectedStyleName,
  });

  if (result.success) revalidatePath("/students");
  return result;
}

export async function updateSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  const statusRaw = formData.get("status") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!id) return { success: false, error: "Missing subscription ID" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };

  const result = await updateSubscription(id, {
    status: statusRaw as SubscriptionStatus,
    notes,
  });

  if (result.success) revalidatePath("/students");
  return result;
}
