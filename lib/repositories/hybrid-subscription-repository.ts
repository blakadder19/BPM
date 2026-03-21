/**
 * Hybrid subscription repository.
 *
 * When Supabase is configured, reads/writes go to Supabase directly.
 * Memory store is only used as the primary source when Supabase is absent.
 */

import { memorySubscriptionRepo } from "./memory/subscription-repository";
import type {
  ISubscriptionRepository,
  CreateSubscriptionData,
  SubscriptionPatch,
} from "./interfaces/subscription-repository";

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function loadSupabaseRepo(): ISubscriptionRepository | null {
  if (!hasSupabaseConfig()) return null;
  try {
    const { supabaseSubscriptionRepo } = require("./supabase/subscription-repository");
    return supabaseSubscriptionRepo as ISubscriptionRepository;
  } catch {
    return null;
  }
}

export const hybridSubscriptionRepo: ISubscriptionRepository = {
  async getAll() {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.getAll();
      } catch (err) {
        console.warn("[hybridSubscriptionRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memorySubscriptionRepo.getAll();
  },

  async getByStudent(studentId) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.getByStudent(studentId);
      } catch (err) {
        console.warn("[hybridSubscriptionRepo.getByStudent] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memorySubscriptionRepo.getByStudent(studentId);
  },

  async getById(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const found = await sbRepo.getById(id);
        if (found) return found;
      } catch (err) {
        console.warn("[hybridSubscriptionRepo.getById] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memorySubscriptionRepo.getById(id);
  },

  async create(data: CreateSubscriptionData) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.create(data);
      } catch (err) {
        console.warn("[hybridSubscriptionRepo.create] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    return memorySubscriptionRepo.create(data);
  },

  async update(id, patch: SubscriptionPatch) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const result = await sbRepo.update(id, patch);
        if (result) return result;
      } catch (err) {
        console.warn("[hybridSubscriptionRepo.update] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    return memorySubscriptionRepo.update(id, patch);
  },
};
