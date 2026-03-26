/**
 * Mutable in-memory teacher roster store.
 *
 * When Supabase is configured, the store starts empty and is hydrated from the
 * `teacher_roster` table via schedule-bootstrap. Write-through persistence is
 * handled by the server actions in lib/actions/classes.ts.
 */

import { generateId } from "@/lib/utils";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type TeacherCategory =
  | "core_instructor"
  | "instructor"
  | "assistant"
  | "yoga"
  | "crew"
  | null;

export const TEACHER_CATEGORY_LABELS: Record<string, string> = {
  core_instructor: "Core Instructor",
  instructor: "Instructor",
  assistant: "Assistant",
  yoga: "Yoga",
  crew: "Crew",
};

export interface Teacher {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  category: TeacherCategory;
  isActive: boolean;
}

const SEED_TEACHERS: Teacher[] = [
  { id: "t-01", fullName: "Zaria",    email: null, phone: null, notes: null, category: "core_instructor", isActive: true },
  { id: "t-02", fullName: "Guillermo", email: null, phone: null, notes: null, category: "core_instructor", isActive: true },
  { id: "t-03", fullName: "Berkan",   email: null, phone: null, notes: null, category: "core_instructor", isActive: true },
  { id: "t-04", fullName: "Bilge",    email: null, phone: null, notes: null, category: "core_instructor", isActive: true },
  { id: "t-05", fullName: "Miguel",   email: null, phone: null, notes: null, category: "instructor", isActive: true },
  { id: "t-06", fullName: "Seda",     email: null, phone: null, notes: null, category: "instructor", isActive: true },
  { id: "t-07", fullName: "Mario",    email: null, phone: null, notes: null, category: "instructor", isActive: true },
  { id: "t-08", fullName: "Camila",   email: null, phone: null, notes: null, category: "instructor", isActive: true },
  { id: "t-09", fullName: "Jennifer", email: null, phone: null, notes: null, category: "yoga", isActive: true },
  { id: "t-10", fullName: "Gizem",    email: null, phone: null, notes: null, category: "yoga", isActive: true },
  { id: "t-11", fullName: "Corey",    email: null, phone: null, notes: null, category: "crew", isActive: true },
  { id: "t-12", fullName: "Orlaith",  email: null, phone: null, notes: null, category: "crew", isActive: true },
  { id: "t-13", fullName: "Marta",    email: null, phone: null, notes: null, category: "crew", isActive: true },
  { id: "t-14", fullName: "Laura",    email: null, phone: null, notes: null, category: "crew", isActive: true },
];

let teachers: Teacher[] | null = null;

function init(): Teacher[] {
  if (!teachers) {
    teachers = hasSupabaseConfig() ? [] : SEED_TEACHERS.map((t) => ({ ...t }));
  }
  return teachers;
}

export function getTeachers(): Teacher[] {
  return init();
}

export function getTeacher(id: string): Teacher | undefined {
  return init().find((t) => t.id === id);
}

export function getTeacherByName(name: string): Teacher | undefined {
  return init().find((t) => t.fullName === name);
}

export function createTeacher(data: {
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  category?: TeacherCategory;
  isActive: boolean;
}): Teacher {
  const list = init();
  const t: Teacher = {
    id: generateId("t"),
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    notes: data.notes,
    category: data.category ?? null,
    isActive: data.isActive,
  };
  list.push(t);
  return t;
}

type TeacherPatch = Partial<Pick<Teacher, "fullName" | "email" | "phone" | "notes" | "category" | "isActive">>;

export function updateTeacher(id: string, patch: TeacherPatch): Teacher | null {
  const list = init();
  const t = list.find((x) => x.id === id);
  if (!t) return null;
  Object.assign(t, patch);
  return { ...t };
}

export function toggleTeacherActive(id: string): Teacher | null {
  const list = init();
  const t = list.find((x) => x.id === id);
  if (!t) return null;
  t.isActive = !t.isActive;
  return { ...t };
}

export function deleteTeacher(id: string): boolean {
  const list = init();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);

  cleanUpTeacherReferences(id);

  return true;
}

/**
 * Remove all future default assignments and schedule instance overrides
 * that reference the given teacher ID. Called on teacher deletion.
 */
function cleanUpTeacherReferences(teacherId: string): void {
  try {
    const { getAssignments } = require("@/lib/services/teacher-store");
    const assignments = getAssignments();
    const today = new Date().toISOString().slice(0, 10);

    for (const a of assignments) {
      const isFuture = !a.effectiveUntil || a.effectiveUntil >= today;
      if (!isFuture) continue;

      if (a.teacher1Id === teacherId && a.teacher2Id === teacherId) {
        a.isActive = false;
        a.teacher1Id = "";
        a.teacher2Id = null;
      } else if (a.teacher1Id === teacherId) {
        if (a.teacher2Id) {
          a.teacher1Id = a.teacher2Id;
          a.teacher2Id = null;
        } else {
          a.isActive = false;
          a.teacher1Id = "";
        }
      } else if (a.teacher2Id === teacherId) {
        a.teacher2Id = null;
      }
    }
  } catch { /* teacher-store not loaded yet */ }

  try {
    const { getInstances } = require("@/lib/services/schedule-store");
    const instances = getInstances();
    const today = new Date().toISOString().slice(0, 10);

    for (const inst of instances) {
      if (inst.date < today) continue;
      if (inst.teacherOverride1Id === teacherId) {
        inst.teacherOverride1Id = null;
        inst.teacherOverride2Id = null;
      } else if (inst.teacherOverride2Id === teacherId) {
        inst.teacherOverride2Id = null;
      }
    }
  } catch { /* schedule-store not loaded yet */ }
}

/** Build a name lookup map: teacherId -> fullName */
export function buildTeacherNameMap(): Map<string, string> {
  return new Map(init().map((t) => [t.id, t.fullName]));
}

/** Returns the set of teacher IDs that are currently inactive. */
export function getInactiveTeacherIds(): Set<string> {
  return new Set(init().filter((t) => !t.isActive).map((t) => t.id));
}

export function replaceTeachers(list: Teacher[]): void {
  teachers = list;
}
