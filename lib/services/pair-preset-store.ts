/**
 * Mutable in-memory pair preset store.
 * Pair presets are convenience shortcuts for quickly assigning teacher combinations.
 * In production, replace with Supabase-backed service.
 */

import { generateId } from "@/lib/utils";

export interface PairPreset {
  id: string;
  label: string;
  teacher1Id: string;
  teacher2Id: string | null;
}

const SEED_PRESETS: PairPreset[] = [
  { id: "pp-01", label: "María & Carlos", teacher1Id: "t-01", teacher2Id: "t-02" },
  { id: "pp-02", label: "Carlos (solo)", teacher1Id: "t-02", teacher2Id: null },
  { id: "pp-03", label: "María (solo)", teacher1Id: "t-01", teacher2Id: null },
];

let presets: PairPreset[] | null = null;

function init(): PairPreset[] {
  if (!presets) {
    presets = SEED_PRESETS.map((p) => ({ ...p }));
  }
  return presets;
}

export function getPresets(): PairPreset[] {
  return init();
}

export function createPreset(data: {
  label: string;
  teacher1Id: string;
  teacher2Id: string | null;
}): PairPreset {
  const list = init();
  const p: PairPreset = {
    id: generateId("pp"),
    label: data.label,
    teacher1Id: data.teacher1Id,
    teacher2Id: data.teacher2Id,
  };
  list.push(p);
  return p;
}

export function deletePreset(id: string): boolean {
  const list = init();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}
