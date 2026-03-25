/**
 * Mutable in-memory class template store.
 * Uses globalThis to survive HMR module re-evaluation in Next.js dev.
 * When Supabase is configured, starts empty — bootstrap fills real data.
 */

import { CLASSES, type MockClass } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { ClassType } from "@/types/domain";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const g = globalThis as unknown as {
  __bpm_classTemplates?: MockClass[];
};

function init(): MockClass[] {
  if (!g.__bpm_classTemplates) {
    g.__bpm_classTemplates = hasSupabaseConfig() ? [] : CLASSES.map((c) => ({ ...c }));
  }
  return g.__bpm_classTemplates;
}

export function getTemplates(): MockClass[] {
  return init();
}

export function getTemplate(id: string): MockClass | undefined {
  return init().find((c) => c.id === id);
}

export function createTemplate(data: {
  title: string;
  classType: ClassType;
  styleName: string | null;
  styleId: string | null;
  level: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  maxCapacity: number | null;
  leaderCap: number | null;
  followerCap: number | null;
  location: string;
  isActive: boolean;
  notes: string | null;
  termBound?: boolean;
  termId?: string | null;
}): MockClass {
  const list = init();
  const tpl: MockClass = {
    id: generateId("c"),
    title: data.title,
    classType: data.classType,
    styleName: data.styleName,
    styleId: data.styleId,
    level: data.level,
    dayOfWeek: data.dayOfWeek,
    startTime: data.startTime,
    endTime: data.endTime,
    maxCapacity: data.maxCapacity,
    leaderCap: data.leaderCap,
    followerCap: data.followerCap,
    location: data.location,
    isActive: data.isActive,
    notes: data.notes,
    termBound: data.termBound ?? false,
    termId: data.termId ?? null,
  };
  list.push(tpl);
  return tpl;
}

type TemplatePatch = Partial<
  Pick<
    MockClass,
    | "title"
    | "classType"
    | "styleName"
    | "styleId"
    | "level"
    | "dayOfWeek"
    | "startTime"
    | "endTime"
    | "maxCapacity"
    | "leaderCap"
    | "followerCap"
    | "location"
    | "isActive"
    | "notes"
    | "termBound"
    | "termId"
  >
>;

export function updateTemplate(
  id: string,
  patch: TemplatePatch
): MockClass | null {
  const list = init();
  const tpl = list.find((c) => c.id === id);
  if (!tpl) return null;
  Object.assign(tpl, patch);
  return { ...tpl };
}

export function toggleTemplateActive(id: string): MockClass | null {
  const list = init();
  const tpl = list.find((c) => c.id === id);
  if (!tpl) return null;
  tpl.isActive = !tpl.isActive;
  return { ...tpl };
}

export function deleteTemplate(id: string): boolean {
  const list = init();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

export function replaceTemplates(newTemplates: MockClass[]): void {
  g.__bpm_classTemplates = newTemplates;
}

export function clearAllTemplates(): number {
  const list = init();
  const count = list.length;
  list.length = 0;
  return count;
}
