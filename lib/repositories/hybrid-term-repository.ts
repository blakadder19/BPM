/**
 * Hybrid term repository.
 *
 * When Supabase is configured, reads/writes go to Supabase directly.
 * Memory store is only used as the primary source when Supabase is absent.
 */

import { memoryTermRepo } from "./memory/term-repository";
import type {
  ITermRepository,
  CreateTermData,
  TermPatch,
} from "./interfaces/term-repository";

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function loadSupabaseRepo(): ITermRepository | null {
  if (!hasSupabaseConfig()) return null;
  try {
    const { supabaseTermRepo } = require("./supabase/term-repository");
    return supabaseTermRepo as ITermRepository;
  } catch {
    return null;
  }
}

export const hybridTermRepo: ITermRepository = {
  async getAll() {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.getAll();
      } catch (err) {
        console.warn("[hybridTermRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryTermRepo.getAll();
  },

  async getById(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const found = await sbRepo.getById(id);
        if (found) return found;
      } catch (err) {
        console.warn("[hybridTermRepo.getById] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryTermRepo.getById(id);
  },

  async create(data: CreateTermData) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      return await sbRepo.create(data);
    }
    return memoryTermRepo.create(data);
  },

  async update(id, patch: TermPatch) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const sbResult = await sbRepo.update(id, patch);
        if (sbResult) return sbResult;
      } catch (err) {
        console.warn("[hybridTermRepo.update] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryTermRepo.update(id, patch);
  },

  async delete(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.delete(id);
      } catch (err) {
        console.warn("[hybridTermRepo.delete] Supabase delete failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryTermRepo.delete(id);
  },
};
