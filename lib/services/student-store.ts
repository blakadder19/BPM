/**
 * Mutable in-memory student store.
 * When Supabase is configured, starts empty — real students come from DB.
 * Mock students are only seeded when no Supabase config is present.
 */

import { STUDENTS, type MockStudent } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { DanceRole } from "@/types/domain";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const g = globalThis as unknown as {
  __bpm_students?: MockStudent[];
};

function init(): MockStudent[] {
  if (!g.__bpm_students) {
    g.__bpm_students = hasSupabaseConfig() ? [] : STUDENTS.map((s) => ({ ...s }));
  }
  return g.__bpm_students;
}

export function getStudents(): MockStudent[] {
  return init();
}

export function getStudent(id: string): MockStudent | undefined {
  return init().find((s) => s.id === id);
}

export function createStudent(data: {
  fullName: string;
  email: string;
  phone: string | null;
  preferredRole: DanceRole | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  dateOfBirth: string | null;
}): MockStudent {
  const list = init();
  const student: MockStudent = {
    id: generateId("s"),
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    preferredRole: data.preferredRole,
    isActive: true,
    notes: data.notes,
    emergencyContactName: data.emergencyContactName,
    emergencyContactPhone: data.emergencyContactPhone,
    dateOfBirth: data.dateOfBirth,
    subscriptionName: null,
    remainingCredits: null,
    joinedAt: new Date().toISOString().slice(0, 10),
  };
  list.push(student);
  return student;
}

type StudentPatch = Partial<
  Pick<
    MockStudent,
    | "fullName"
    | "email"
    | "phone"
    | "preferredRole"
    | "isActive"
    | "notes"
    | "emergencyContactName"
    | "emergencyContactPhone"
    | "dateOfBirth"
  >
>;

export function updateStudent(
  id: string,
  patch: StudentPatch
): MockStudent | null {
  const list = init();
  const student = list.find((s) => s.id === id);
  if (!student) return null;

  if (patch.fullName !== undefined) student.fullName = patch.fullName;
  if (patch.email !== undefined) student.email = patch.email;
  if (patch.phone !== undefined) student.phone = patch.phone || null;
  if (patch.preferredRole !== undefined) student.preferredRole = patch.preferredRole;
  if (patch.isActive !== undefined) student.isActive = patch.isActive;
  if (patch.notes !== undefined) student.notes = patch.notes;
  if (patch.emergencyContactName !== undefined) student.emergencyContactName = patch.emergencyContactName;
  if (patch.emergencyContactPhone !== undefined) student.emergencyContactPhone = patch.emergencyContactPhone;
  if (patch.dateOfBirth !== undefined) student.dateOfBirth = patch.dateOfBirth;

  return { ...student };
}

export function deleteStudent(id: string): boolean {
  const list = init();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

export function toggleStudentActive(id: string): MockStudent | null {
  const list = init();
  const student = list.find((s) => s.id === id);
  if (!student) return null;
  student.isActive = !student.isActive;
  return { ...student };
}
