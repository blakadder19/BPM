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
    let result;
    if (sbRepo) {
      result = await sbRepo.create(data);
    } else {
      result = memoryProductRepo.create(data);
    }
    invalidateProductCache();
    return result;
  },

  async update(id, patch: ProductPatch) {
    const sbRepo = loadSupabaseRepo();
    let result = null;
    if (sbRepo) {
      try {
        result = await sbRepo.update(id, patch);
      } catch (err) {
        console.warn("[hybridProductRepo.update] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    if (!result) {
      result = await memoryProductRepo.update(id, patch);
    }
    if (result) invalidateProductCache();
    return result;
  },

  async toggleActive(id) {
    const sbRepo = loadSupabaseRepo();
    let result = null;
    if (sbRepo) {
      try {
        result = await sbRepo.toggleActive(id);
      } catch (err) {
        console.warn("[hybridProductRepo.toggleActive] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    if (!result) {
      result = await memoryProductRepo.toggleActive(id);
    }
    if (result) invalidateProductCache();
    return result;
  },

  async delete(id) {
    const sbRepo = loadSupabaseRepo();
    let result = false;
    if (sbRepo) {
      try {
        result = await sbRepo.delete(id);
      } catch (err) {
        console.warn("[hybridProductRepo.delete] Supabase delete failed:", err instanceof Error ? err.message : err);
      }
    }
    if (!result) {
      result = await memoryProductRepo.delete(id);
    }
    if (result) invalidateProductCache();
    return result;
  },
};
