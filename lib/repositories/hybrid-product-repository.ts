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

export const hybridProductRepo: IProductRepository = {
  async getAll() {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.getAll();
      } catch (err) {
        console.warn("[hybridProductRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryProductRepo.getAll();
  },

  async getById(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const found = await sbRepo.getById(id);
        if (found) return found;
      } catch (err) {
        console.warn("[hybridProductRepo.getById] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryProductRepo.getById(id);
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
