"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/staff-permissions";
import { getTermRepo } from "@/lib/repositories";
import type { TermStatus } from "@/types/domain";

const VALID_STATUSES = new Set<string>(["draft", "active", "upcoming", "past"]);

export async function createTermAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireSuperAdmin();
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

  await getTermRepo().create({
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
  await requireSuperAdmin();
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

  const result = await getTermRepo().update(id, {
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

export async function deleteTermAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireSuperAdmin();
  if (!id) return { success: false, error: "Missing term ID" };

  const existing = await getTermRepo().getById(id);
  if (!existing) return { success: false, error: "Term not found" };

  const deleted = await getTermRepo().delete(id);
  if (!deleted) return { success: false, error: "Failed to delete term" };

  revalidatePath("/terms");
  return { success: true };
}
