"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createPreset, deletePreset } from "@/lib/services/pair-preset-store";

function revalidateTeachers() {
  revalidatePath("/classes/teachers");
}

export async function createPairPresetAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const label = (formData.get("label") as string)?.trim();
  const teacher1Id = (formData.get("teacher1Id") as string)?.trim();
  const teacher2Id = (formData.get("teacher2Id") as string)?.trim() || null;

  if (!label) return { success: false, error: "Label is required" };
  if (!teacher1Id) return { success: false, error: "Teacher 1 is required" };

  createPreset({ label, teacher1Id, teacher2Id });
  revalidateTeachers();
  return { success: true };
}

export async function deletePairPresetAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing preset ID" };
  const deleted = deletePreset(id);
  if (!deleted) return { success: false, error: "Preset not found" };
  revalidateTeachers();
  return { success: true };
}
