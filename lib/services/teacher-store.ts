/**
 * Mutable in-memory teacher assignment store, seeded from mock data.
 * Assignments now reference teacher IDs from the teacher roster.
 * In production, replace with Supabase-backed service.
 */

import { TEACHER_PAIRS, type MockTeacherPair } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";

let assignments: MockTeacherPair[] | null = null;

function init(): MockTeacherPair[] {
  if (!assignments) {
    assignments = TEACHER_PAIRS.map((tp) => ({ ...tp }));
  }
  return assignments;
}

export function getAssignments(): MockTeacherPair[] {
  return init();
}

export function getAssignment(id: string): MockTeacherPair | undefined {
  return init().find((tp) => tp.id === id);
}

/** Get the current active assignment for a given class template. */
export function getActiveAssignmentForClass(classId: string): MockTeacherPair | undefined {
  return init().find((tp) => tp.classId === classId && tp.isActive);
}

export function createAssignment(data: {
  classId: string;
  classTitle: string;
  teacher1Id: string;
  teacher2Id: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  isActive: boolean;
}): MockTeacherPair {
  const list = init();
  const tp: MockTeacherPair = {
    id: generateId("tp"),
    classId: data.classId,
    classTitle: data.classTitle,
    teacher1Id: data.teacher1Id,
    teacher2Id: data.teacher2Id,
    effectiveFrom: data.effectiveFrom,
    effectiveUntil: data.effectiveUntil,
    isActive: data.isActive,
  };
  list.push(tp);
  return tp;
}

type AssignmentPatch = Partial<
  Pick<
    MockTeacherPair,
    | "teacher1Id"
    | "teacher2Id"
    | "effectiveFrom"
    | "effectiveUntil"
    | "isActive"
  >
>;

export function updateAssignment(
  id: string,
  patch: AssignmentPatch
): MockTeacherPair | null {
  const list = init();
  const tp = list.find((a) => a.id === id);
  if (!tp) return null;
  Object.assign(tp, patch);
  return { ...tp };
}

export function toggleAssignmentActive(id: string): MockTeacherPair | null {
  const list = init();
  const tp = list.find((a) => a.id === id);
  if (!tp) return null;
  tp.isActive = !tp.isActive;
  return { ...tp };
}

export function deleteAssignment(id: string): boolean {
  const list = init();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

export function clearAllAssignments(): number {
  const list = init();
  const count = list.length;
  list.length = 0;
  return count;
}
