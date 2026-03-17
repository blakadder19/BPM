"use server";

import { updateStudent } from "@/lib/services/student-store";
import type { DanceRole } from "@/types/domain";

export async function updateStudentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const roleRaw = formData.get("preferredRole") as string;
  const preferredRole: DanceRole | null =
    roleRaw === "leader" || roleRaw === "follower" ? roleRaw : null;

  if (!id) return { success: false, error: "Missing student ID" };
  if (!fullName) return { success: false, error: "Name is required" };
  if (!email) return { success: false, error: "Email is required" };

  const updated = updateStudent(id, { fullName, email, phone, preferredRole });
  if (!updated) return { success: false, error: "Student not found" };

  return { success: true };
}
