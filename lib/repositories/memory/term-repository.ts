import * as store from "@/lib/services/term-store";
import type { ITermRepository, CreateTermData, TermPatch } from "../interfaces/term-repository";

export const memoryTermRepo: ITermRepository = {
  getAll: async () => store.getTerms(),
  getById: async (id) => store.getTerm(id) ?? null,
  create: async (data: CreateTermData) => store.createTerm(data),
  update: async (id, patch: TermPatch) => store.updateTerm(id, patch),
};
