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

const g = globalThis as unknown as { __bpm_terms_cache?: { ts: number; data: Awaited<ReturnType<ITermRepository["getAll"]>> } };
const CACHE_TTL_MS = 10_000;

export const hybridTermRepo: ITermRepository = {
  async getAll() {
    const now = Date.now();
    if (g.__bpm_terms_cache && now - g.__bpm_terms_cache.ts < CACHE_TTL_MS) {
      return g.__bpm_terms_cache.data;
    }
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const data = await sbRepo.getAll();
        g.__bpm_terms_cache = { ts: now, data };
        return data;
      } catch (err) {
        console.warn("[hybridTermRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryTermRepo.getAll();
  },

  async getById(id) {
    const all = await this.getAll();
    return all.find((t) => t.id === id) ?? null;
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
