/**
 * Hybrid subscription repository.
 *
 * Reads: after operational hydration, served from the in-memory store
 * (already populated by refreshOperationalData()). This avoids redundant
 * Supabase round-trips on every getAll/getByStudent/getById call.
 *
 * Writes: always go to Supabase when configured, with memory fallback.
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

export function invalidateSubscriptionCache(): void {
  /* no-op — reads come from the memory store which is refreshed by hydration */
}

export const hybridSubscriptionRepo: ISubscriptionRepository = {
  async getAll() {
    return memorySubscriptionRepo.getAll();
  },

  async getByStudent(studentId) {
    return memorySubscriptionRepo.getByStudent(studentId);
  },

  async getById(id) {
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

  async delete(id: string) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.delete(id);
      } catch (err) {
        console.warn("[hybridSubscriptionRepo.delete] Supabase delete failed:", err instanceof Error ? err.message : err);
      }
    }
    return memorySubscriptionRepo.delete(id);
  },
};
