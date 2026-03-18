/**
 * Mutable in-memory class template store, seeded from mock data.
 * In production, replace with Supabase-backed service.
 */

import { CLASSES, type MockClass } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { ClassType } from "@/types/domain";

let templates: MockClass[] | null = null;

function init(): MockClass[] {
  if (!templates) {
    templates = CLASSES.map((c) => ({ ...c }));
  }
  return templates;
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

export function clearAllTemplates(): number {
  const list = init();
  const count = list.length;
  list.length = 0;
  return count;
}
