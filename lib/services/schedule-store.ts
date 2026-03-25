/**
 * Mutable in-memory schedule (bookable class instance) store.
 * Uses globalThis to survive HMR module re-evaluation in Next.js dev.
 * When Supabase is configured, starts empty — bootstrap fills real data.
 */

import { BOOKABLE_CLASSES, type MockBookableClass } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { ClassType, InstanceStatus } from "@/types/domain";
import { getTemplates } from "./class-store";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const g = globalThis as unknown as {
  __bpm_scheduleInstances?: MockBookableClass[];
};

function init(): MockBookableClass[] {
  if (!g.__bpm_scheduleInstances) {
    g.__bpm_scheduleInstances = hasSupabaseConfig() ? [] : BOOKABLE_CLASSES.map((bc) => ({ ...bc }));
  }
  return g.__bpm_scheduleInstances;
}

export function getInstances(): MockBookableClass[] {
  return init();
}

export function getInstance(id: string): MockBookableClass | undefined {
  return init().find((bc) => bc.id === id);
}

export function createInstance(data: {
  classId: string | null;
  title: string;
  classType: ClassType;
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  date: string;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string;
  status: InstanceStatus;
  notes: string | null;
  termBound?: boolean;
  termId?: string | null;
}): MockBookableClass {
  const list = init();
  const inst: MockBookableClass = {
    id: generateId("bc"),
    classId: data.classId,
    title: data.title,
    classType: data.classType,
    styleName: data.styleName,
    styleId: data.styleId,
    level: data.level,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    maxCapacity: data.maxCapacity,
    leaderCap: data.leaderCap,
    followerCap: data.followerCap,
    status: data.status,
    location: data.location,
    bookedCount: 0,
    leaderCount: 0,
    followerCount: 0,
    waitlistCount: 0,
    notes: data.notes,
    termBound: data.termBound ?? false,
    termId: data.termId ?? null,
  };
  list.push(inst);
  return inst;
}

type InstancePatch = Partial<
  Pick<
    MockBookableClass,
    | "title"
    | "date"
    | "startTime"
    | "endTime"
    | "maxCapacity"
    | "leaderCap"
    | "followerCap"
    | "location"
    | "status"
    | "notes"
    | "teacherOverride1Id"
    | "teacherOverride2Id"
    | "termBound"
    | "termId"
  >
>;

export function updateInstance(
  id: string,
  patch: InstancePatch
): MockBookableClass | null {
  const list = init();
  const inst = list.find((bc) => bc.id === id);
  if (!inst) return null;
  Object.assign(inst, patch);
  return { ...inst };
}

export function updateInstanceStatus(
  id: string,
  status: InstanceStatus
): MockBookableClass | null {
  return updateInstance(id, { status });
}

export interface GenerateOptions {
  includeInactive?: boolean;
  overwrite?: boolean;
}

/**
 * Preview generation without mutating state.
 */
export function previewGeneration(
  startDate: string,
  endDate: string,
  opts?: GenerateOptions
): { toCreate: number; toSkip: number; toOverwrite: number } {
  const list = init();
  const tpls = opts?.includeInactive
    ? getTemplates()
    : getTemplates().filter((t) => t.isActive);

  const existingByKey = new Map<string, MockBookableClass>();
  for (const bc of list) {
    if (bc.classId) existingByKey.set(`${bc.classId}|${bc.date}|${bc.startTime}`, bc);
  }

  let toCreate = 0;
  let toSkip = 0;
  let toOverwrite = 0;

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    const dateStr = d.toISOString().slice(0, 10);
    for (const tpl of tpls) {
      if (tpl.dayOfWeek !== isoDay) continue;
      const key = `${tpl.id}|${dateStr}|${tpl.startTime}`;
      if (existingByKey.has(key)) {
        if (opts?.overwrite) toOverwrite++;
        else toSkip++;
      } else {
        toCreate++;
      }
    }
  }

  return { toCreate, toSkip, toOverwrite };
}

/**
 * Generate dated instances from templates for each day-of-week
 * within [startDate, endDate]. Skips or overwrites duplicates by (classId, date, startTime).
 */
export function generateFromTemplates(
  startDate: string,
  endDate: string,
  opts?: GenerateOptions,
  terms?: { id: string; startDate: string; endDate: string }[]
): { created: number; skipped: number; overwritten: number } {
  const list = init();
  const tpls = opts?.includeInactive
    ? getTemplates()
    : getTemplates().filter((t) => t.isActive);

  const existingByKey = new Map<string, number>();
  for (let i = 0; i < list.length; i++) {
    const bc = list[i];
    if (bc.classId) existingByKey.set(`${bc.classId}|${bc.date}|${bc.startTime}`, i);
  }

  let created = 0;
  let skipped = 0;
  let overwritten = 0;

  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const jsDay = d.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    const dateStr = d.toISOString().slice(0, 10);

    for (const tpl of tpls) {
      if (tpl.dayOfWeek !== isoDay) continue;

      // Rule 1: term-bound templates — skip dates outside the linked term range
      if (tpl.termBound && terms) {
        if (tpl.termId) {
          const linkedTerm = terms.find((t) => t.id === tpl.termId);
          if (linkedTerm && (dateStr < linkedTerm.startDate || dateStr > linkedTerm.endDate)) {
            skipped++;
            continue;
          }
        } else {
          // No explicit termId — skip if date is outside ALL terms
          const anyMatch = terms.some((t) => t.startDate <= dateStr && dateStr <= t.endDate);
          if (!anyMatch) {
            skipped++;
            continue;
          }
        }
      }

      const key = `${tpl.id}|${dateStr}|${tpl.startTime}`;
      const existingIdx = existingByKey.get(key);

      if (existingIdx !== undefined) {
        if (opts?.overwrite) {
          list[existingIdx] = {
            id: list[existingIdx].id,
            classId: tpl.id,
            title: tpl.title,
            classType: tpl.classType,
            styleName: tpl.styleName,
            styleId: tpl.styleId,
            level: tpl.level,
            date: dateStr,
            startTime: tpl.startTime,
            endTime: tpl.endTime,
            maxCapacity: tpl.maxCapacity,
            leaderCap: tpl.leaderCap,
            followerCap: tpl.followerCap,
            status: "scheduled",
            location: tpl.location,
            bookedCount: 0,
            leaderCount: 0,
            followerCount: 0,
            waitlistCount: 0,
            notes: null,
            termBound: tpl.termBound ?? false,
            termId: tpl.termId ?? null,
          };
          overwritten++;
        } else {
          skipped++;
        }
        continue;
      }

      const newInst: MockBookableClass = {
        id: generateId("bc"),
        classId: tpl.id,
        title: tpl.title,
        classType: tpl.classType,
        styleName: tpl.styleName,
        styleId: tpl.styleId,
        level: tpl.level,
        date: dateStr,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        maxCapacity: tpl.maxCapacity,
        leaderCap: tpl.leaderCap,
        followerCap: tpl.followerCap,
        status: "scheduled",
        location: tpl.location,
        bookedCount: 0,
        leaderCount: 0,
        followerCount: 0,
        waitlistCount: 0,
        notes: null,
        termBound: tpl.termBound ?? false,
        termId: tpl.termId ?? null,
      };
      list.push(newInst);
      existingByKey.set(key, list.length - 1);
      created++;
    }
  }

  return { created, skipped, overwritten };
}

export function deleteInstance(id: string): boolean {
  const list = init();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

export function replaceInstances(newInstances: MockBookableClass[]): void {
  g.__bpm_scheduleInstances = newInstances;
}

export function clearAllInstances(): number {
  const list = init();
  const count = list.length;
  list.length = 0;
  return count;
}
