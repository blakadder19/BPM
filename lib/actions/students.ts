"use server";

import { revalidatePath } from "next/cache";
import {
  createStudent,
  updateStudent,
  toggleStudentActive,
} from "@/lib/services/student-service";
import type { DanceRole } from "@/types/domain";

function parseRole(raw: string | null): DanceRole | null {
  return raw === "leader" || raw === "follower" ? raw : null;
}

export async function createStudentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const preferredRole = parseRole(formData.get("preferredRole") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const emergencyContactName = (formData.get("emergencyContactName") as string)?.trim() || null;
  const emergencyContactPhone = (formData.get("emergencyContactPhone") as string)?.trim() || null;
  const dateOfBirth = (formData.get("dateOfBirth") as string)?.trim() || null;

  if (!fullName) return { success: false, error: "Name is required" };
  if (!email || !email.includes("@"))
    return { success: false, error: "A valid email is required" };

  const result = await createStudent({
    fullName,
    email,
    phone,
    preferredRole,
    notes,
    emergencyContactName,
    emergencyContactPhone,
    dateOfBirth,
  });

  if (result.success) revalidatePath("/students");
  return result;
}

export async function updateStudentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const preferredRole = parseRole(formData.get("preferredRole") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const emergencyContactName = (formData.get("emergencyContactName") as string)?.trim() || null;
  const emergencyContactPhone = (formData.get("emergencyContactPhone") as string)?.trim() || null;
  const dateOfBirth = (formData.get("dateOfBirth") as string)?.trim() || null;
  const isActiveRaw = formData.get("isActive") as string;
  const isActive = isActiveRaw === "true";

  if (!id) return { success: false, error: "Missing student ID" };
  if (!fullName) return { success: false, error: "Name is required" };
  if (!email || !email.includes("@"))
    return { success: false, error: "A valid email is required" };

  const result = await updateStudent(id, {
    fullName,
    email,
    phone,
    preferredRole,
    isActive,
    notes,
    emergencyContactName,
    emergencyContactPhone,
    dateOfBirth,
  });

  if (result.success) revalidatePath("/students");
  return result;
}

export async function toggleStudentActiveAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing student ID" };

  const result = await toggleStudentActive(id);
  if (result.success) revalidatePath("/students");
  return result;
}
