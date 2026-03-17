/**
 * Mutable in-memory student store, seeded from mock data.
 * In production, replace with Supabase-backed service.
 */

import { STUDENTS, type MockStudent } from "@/lib/mock-data";

let students: MockStudent[] | null = null;

function init(): MockStudent[] {
  if (!students) {
    students = STUDENTS.map((s) => ({ ...s }));
  }
  return students;
}

export function getStudents(): MockStudent[] {
  return init();
}

export function getStudent(id: string): MockStudent | undefined {
  return init().find((s) => s.id === id);
}

export function updateStudent(
  id: string,
  patch: Partial<Pick<MockStudent, "fullName" | "email" | "phone" | "preferredRole">>
): MockStudent | null {
  const list = init();
  const student = list.find((s) => s.id === id);
  if (!student) return null;

  if (patch.fullName !== undefined) student.fullName = patch.fullName;
  if (patch.email !== undefined) student.email = patch.email;
  if (patch.phone !== undefined) student.phone = patch.phone || null;
  if (patch.preferredRole !== undefined) student.preferredRole = patch.preferredRole;

  return { ...student };
}
