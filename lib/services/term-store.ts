/**
 * Mutable in-memory term store, seeded from mock data.
 * In production, replace with Supabase-backed service.
 */

import { TERMS, type MockTerm } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { TermStatus } from "@/types/domain";

let terms: MockTerm[] | null = null;

function init(): MockTerm[] {
  if (!terms) {
    terms = TERMS.map((t) => ({ ...t }));
  }
  return terms;
}

export function getTerms(): MockTerm[] {
  return init();
}

export function getTerm(id: string): MockTerm | undefined {
  return init().find((t) => t.id === id);
}

export function createTerm(data: {
  name: string;
  startDate: string;
  endDate: string;
  status: TermStatus;
  notes: string | null;
}): MockTerm {
  const list = init();
  const term: MockTerm = {
    id: generateId("term"),
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    status: data.status,
    notes: data.notes,
  };
  list.push(term);
  return term;
}

export function updateTerm(
  id: string,
  patch: Partial<Pick<MockTerm, "name" | "startDate" | "endDate" | "status" | "notes">>
): MockTerm | null {
  const list = init();
  const term = list.find((t) => t.id === id);
  if (!term) return null;

  if (patch.name !== undefined) term.name = patch.name;
  if (patch.startDate !== undefined) term.startDate = patch.startDate;
  if (patch.endDate !== undefined) term.endDate = patch.endDate;
  if (patch.status !== undefined) term.status = patch.status;
  if (patch.notes !== undefined) term.notes = patch.notes;

  return { ...term };
}
