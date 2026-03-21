/**
 * Student service — delegates to the repository selected by DATA_PROVIDER.
 */

import { getStudentRepo } from "@/lib/repositories";
import type { MockStudent } from "@/lib/mock-data";
import type { DanceRole } from "@/types/domain";

export async function getStudents(): Promise<MockStudent[]> {
  return getStudentRepo().getAll();
}

export async function getStudent(id: string): Promise<MockStudent | null> {
  return getStudentRepo().getById(id);
}

export async function createStudent(data: {
  fullName: string;
  email: string;
  phone: string | null;
  preferredRole: DanceRole | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfBirth: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await getStudentRepo().create(data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updateStudent(
  id: string,
  patch: {
    fullName?: string;
    email?: string;
    phone?: string | null;
    preferredRole?: DanceRole | null;
    isActive?: boolean;
    notes?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    dateOfBirth?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const result = await getStudentRepo().update(id, patch);
  return result
    ? { success: true }
    : { success: false, error: "Student not found" };
}

export async function deleteStudent(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await getStudentRepo().delete(id);
    return result
      ? { success: true }
      : { success: false, error: "Student not found" };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function toggleStudentActive(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const result = await getStudentRepo().toggleActive(id);
  return result
    ? { success: true }
    : { success: false, error: "Student not found" };
}
