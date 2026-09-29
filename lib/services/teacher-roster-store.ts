/**
 * Mutable in-memory teacher roster store.
 *
 * When Supabase is configured, the store starts empty and is hydrated from the
 * `teacher_roster` table via schedule-bootstrap. Write-through persistence is
 * handled by the server actions in lib/actions/classes.ts.
 */

import { generateId } from "@/lib/utils";
import { isSupabaseMode } from "@/lib/config/data-provider";

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
  /**
   * Phase 18 — optional link to the BPM account for this teacher.
   *
   * NULL for roster entries with no login (guest/visiting
   * instructors) and for all pre-Phase-18 rows, which were never
   * backfilled because matching by display name is unsafe.
   *
   * Staff PERMISSIONS are never derived from this field — see
   * `users.staff_role_key`. This link exists so teacher-assignment
   * screens can resolve a roster entry to an account reliably.
   */
  userId?: string | null;
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
    teachers = isSupabaseMode() ? [] : SEED_TEACHERS.map((t) => ({ ...t }));
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
  userId?: string | null;
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
    userId: data.userId ?? null,
  };
  list.push(t);
  return t;
}

/**
 * Phase 18 — link a BPM account to a teaching-roster entry.
 *
 * Called only when an admin explicitly ticks "Add to teaching roster"
 * while granting Teacher staff access. Deliberately conservative:
 *
 *   1. Already linked to this user → no-op, returns true (idempotent,
 *      so re-granting a role does not create duplicates).
 *   2. An UNLINKED roster row with a matching email → adopt it. Email
 *      is a real identifier; display name is not.
 *   3. Otherwise → create a fresh roster entry linked to the account.
 *
 * It never matches on `fullName`. The seeded roster contains a bare
 * "Guillermo" with `email: null`, and silently adopting that row on a
 * name collision is precisely the kind of guess that produces wrong
 * teacher assignments.
 *
 * Returns true when a row was created or linked.
 */
export async function linkTeacherRosterToUser(input: {
  userId: string;
  fullName: string;
  email: string;
}): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const list = init();

  // 1. Idempotency.
  if (list.some((t) => t.userId === input.userId)) return true;

  // 2. Adopt an unlinked entry with the same email.
  const byEmail = list.find(
    (t) => !t.userId && (t.email ?? "").trim().toLowerCase() === email && email.length > 0,
  );
  if (byEmail) {
    byEmail.userId = input.userId;
    if (isSupabaseMode()) {
      const { supabaseTeacherRosterRepo } = await import(
        "@/lib/repositories/supabase/teacher-roster-repository"
      );
      await supabaseTeacherRosterRepo.update(byEmail.id, { userId: input.userId });
    }
    return true;
  }

  // 3. Create a new linked entry.
  if (isSupabaseMode()) {
    const { supabaseTeacherRosterRepo } = await import(
      "@/lib/repositories/supabase/teacher-roster-repository"
    );
    const created = await supabaseTeacherRosterRepo.create({
      fullName: input.fullName,
      email: input.email,
      phone: null,
      notes: "Added automatically when Teacher staff access was granted.",
      category: null,
      isActive: true,
      userId: input.userId,
    });
    list.push(created);
    return true;
  }

  createTeacher({
    fullName: input.fullName,
    email: input.email,
    phone: null,
    notes: "Added automatically when Teacher staff access was granted.",
    category: null,
    isActive: true,
    userId: input.userId,
  });
  return true;
}

type TeacherPatch = Partial<Pick<Teacher, "fullName" | "email" | "phone" | "notes" | "category" | "isActive" | "userId">>;

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
