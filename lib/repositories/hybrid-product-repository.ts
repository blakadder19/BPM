/**
 * Hybrid product repository.
 *
 * When Supabase is configured, reads/writes go to Supabase directly.
 * Memory store is only used as the primary source when Supabase is absent.
 */

import { memoryProductRepo } from "./memory/product-repository";
import type {
  IProductRepository,
  CreateProductData,
  ProductPatch,
} from "./interfaces/product-repository";

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function loadSupabaseRepo(): IProductRepository | null {
  if (!hasSupabaseConfig()) return null;
  try {
    const { supabaseProductRepo } = require("./supabase/product-repository");
    return supabaseProductRepo as IProductRepository;
  } catch {
    return null;
  }
}

// Per-request cache: avoids repeated Supabase round-trips for the same getAll()
const g = globalThis as unknown as { __bpm_products_cache?: { ts: number; data: Awaited<ReturnType<IProductRepository["getAll"]>> } };
const CACHE_TTL_MS = 10_000;

export function invalidateProductCache(): void {
  g.__bpm_products_cache = undefined;
}

export const hybridProductRepo: IProductRepository = {
  async getAll() {
    const now = Date.now();
    if (g.__bpm_products_cache && now - g.__bpm_products_cache.ts < CACHE_TTL_MS) {
      return g.__bpm_products_cache.data;
    }
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const data = await sbRepo.getAll();
        g.__bpm_products_cache = { ts: now, data };
        return data;
      } catch (err) {
        console.warn("[hybridProductRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryProductRepo.getAll();
  },

  async getById(id) {
    const all = await this.getAll();
    return all.find((p) => p.id === id) ?? null;
  },

  async create(data: CreateProductData) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      return await sbRepo.create(data);
    }
    return memoryProductRepo.create(data);
  },

  async update(id, patch: ProductPatch) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const sbResult = await sbRepo.update(id, patch);
        if (sbResult) return sbResult;
      } catch (err) {
        console.warn("[hybridProductRepo.update] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryProductRepo.update(id, patch);
  },

  async toggleActive(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const sbResult = await sbRepo.toggleActive(id);
        if (sbResult) return sbResult;
      } catch (err) {
        console.warn("[hybridProductRepo.toggleActive] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryProductRepo.toggleActive(id);
  },

  async delete(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.delete(id);
      } catch (err) {
        console.warn("[hybridProductRepo.delete] Supabase delete failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryProductRepo.delete(id);
  },
};
