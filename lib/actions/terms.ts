"use server";

import { revalidatePath } from "next/cache";
import { createTerm, updateTerm } from "@/lib/services/term-store";
import type { TermStatus } from "@/types/domain";

const VALID_STATUSES = new Set<string>(["draft", "active", "upcoming", "past"]);

export async function createTermAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const name = (formData.get("name") as string)?.trim();
  const startDate = (formData.get("startDate") as string)?.trim();
  const endDate = (formData.get("endDate") as string)?.trim();
  const statusRaw = (formData.get("status") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!name) return { success: false, error: "Name is required" };
  if (!startDate) return { success: false, error: "Start date is required" };
  if (!endDate) return { success: false, error: "End date is required" };
  if (endDate < startDate) return { success: false, error: "End date must be after start date" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };

  createTerm({
    name,
    startDate,
    endDate,
    status: statusRaw as TermStatus,
    notes,
  });

  revalidatePath("/terms");
  return { success: true };
}

export async function updateTermAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = (formData.get("id") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const startDate = (formData.get("startDate") as string)?.trim();
  const endDate = (formData.get("endDate") as string)?.trim();
  const statusRaw = (formData.get("status") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!id) return { success: false, error: "Missing term ID" };
  if (!name) return { success: false, error: "Name is required" };
  if (!startDate) return { success: false, error: "Start date is required" };
  if (!endDate) return { success: false, error: "End date is required" };
  if (endDate < startDate) return { success: false, error: "End date must be after start date" };
  if (!VALID_STATUSES.has(statusRaw)) return { success: false, error: "Invalid status" };

  const result = updateTerm(id, {
    name,
    startDate,
    endDate,
    status: statusRaw as TermStatus,
    notes,
  });

  if (!result) return { success: false, error: "Term not found" };

  revalidatePath("/terms");
  return { success: true };
}
