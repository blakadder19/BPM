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

export interface Teacher {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
}

const SEED_TEACHERS: Teacher[] = [
  { id: "t-01", fullName: "María García", email: "maria@bpm.dance", phone: null, notes: null, isActive: true },
  { id: "t-02", fullName: "Carlos Rivera", email: "carlos@bpm.dance", phone: null, notes: null, isActive: true },
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
  isActive: boolean;
}): Teacher {
  const list = init();
  const t: Teacher = {
    id: generateId("t"),
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    notes: data.notes,
    isActive: data.isActive,
  };
  list.push(t);
  return t;
}

type TeacherPatch = Partial<Pick<Teacher, "fullName" | "email" | "phone" | "notes" | "isActive">>;

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
  return true;
}

/** Build a name lookup map: teacherId -> fullName */
export function buildTeacherNameMap(): Map<string, string> {
  return new Map(init().map((t) => [t.id, t.fullName]));
}

export function replaceTeachers(list: Teacher[]): void {
  teachers = list;
}
