"use server";

import { revalidatePath } from "next/cache";
import {
  createSubscription,
  updateSubscription,
} from "@/lib/services/subscription-service";
import type { SubscriptionStatus } from "@/types/domain";

const VALID_STATUSES = new Set<string>([
  "active",
  "paused",
  "expired",
  "exhausted",
  "cancelled",
]);

function parseCredits(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? null : n;
}

function validateDates(
  from: string | null,
  until: string | null
): string | null {
  if (from && until && until < from) {
    return "End date cannot be before start date";
  }
  return null;
}

export async function createSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const studentId = formData.get("studentId") as string;
  const productName = (formData.get("productName") as string)?.trim();
  const statusRaw = formData.get("status") as string;
  const validFrom = formData.get("validFrom") as string;
  const validUntil = (formData.get("validUntil") as string) || null;
  const totalCredits = parseCredits(formData.get("totalCredits") as string);
  const remainingCredits = parseCredits(formData.get("remainingCredits") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!studentId) return { success: false, error: "Missing student ID" };
  if (!productName) return { success: false, error: "Product name is required" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };
  if (!validFrom) return { success: false, error: "Start date is required" };

  const dateErr = validateDates(validFrom, validUntil);
  if (dateErr) return { success: false, error: dateErr };

  const result = await createSubscription({
    studentId,
    productName,
    status: statusRaw as SubscriptionStatus,
    totalCredits,
    remainingCredits,
    validFrom,
    validUntil,
    notes,
  });

  if (result.success) revalidatePath("/students");
  return result;
}

export async function updateSubscriptionAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  const productName = (formData.get("productName") as string)?.trim();
  const statusRaw = formData.get("status") as string;
  const validFrom = formData.get("validFrom") as string;
  const validUntil = (formData.get("validUntil") as string) || null;
  const totalCredits = parseCredits(formData.get("totalCredits") as string);
  const remainingCredits = parseCredits(formData.get("remainingCredits") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!id) return { success: false, error: "Missing subscription ID" };
  if (!productName) return { success: false, error: "Product name is required" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };

  const dateErr = validateDates(validFrom, validUntil);
  if (dateErr) return { success: false, error: dateErr };

  const result = await updateSubscription(id, {
    productName,
    status: statusRaw as SubscriptionStatus,
    totalCredits,
    remainingCredits,
    validFrom,
    validUntil,
    notes,
  });

  if (result.success) revalidatePath("/students");
  return result;
}
