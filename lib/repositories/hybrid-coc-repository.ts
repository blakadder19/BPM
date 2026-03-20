/**
 * Hybrid CoC repository — delegates to memory for mock student IDs
 * (prefix "s-") and to Supabase for real UUIDs when configured.
 *
 * If the Supabase call fails (e.g. table not yet migrated, network
 * issue), writes fall back to the memory repo so onboarding is not
 * blocked. A console warning surfaces the underlying error.
 */

import { memoryCocRepo } from "./memory/coc-repository";
import type { ICocRepository } from "./interfaces/coc-repository";

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function isMockId(id: string): boolean {
  return id.startsWith("s-") || id.startsWith("dev-");
}

function loadSupabaseCocRepo(): ICocRepository | null {
  if (!hasSupabaseConfig()) return null;
  try {
    const { supabaseCocRepo } = require("./supabase/coc-repository");
    return supabaseCocRepo as ICocRepository;
  } catch {
    return null;
  }
}

function pickRepo(studentId: string): ICocRepository {
  if (isMockId(studentId)) return memoryCocRepo;
  const sb = loadSupabaseCocRepo();
  return sb ?? memoryCocRepo;
}

export const hybridCocRepo: ICocRepository = {
  getAcceptance: async (studentId) => {
    const primary = pickRepo(studentId);
    try {
      return await primary.getAcceptance(studentId);
    } catch (err) {
      if (primary !== memoryCocRepo) {
        console.warn("[hybridCocRepo] Supabase getAcceptance failed, falling back to memory:", err instanceof Error ? err.message : err);
        return memoryCocRepo.getAcceptance(studentId);
      }
      return null;
    }
  },

  hasAcceptedVersion: async (studentId, version) => {
    const primary = pickRepo(studentId);
    try {
      return await primary.hasAcceptedVersion(studentId, version);
    } catch (err) {
      if (primary !== memoryCocRepo) {
        console.warn("[hybridCocRepo] Supabase hasAcceptedVersion failed, falling back to memory:", err instanceof Error ? err.message : err);
        return memoryCocRepo.hasAcceptedVersion(studentId, version);
      }
      return false;
    }
  },

  accept: async (studentId, version) => {
    const primary = pickRepo(studentId);
    try {
      return await primary.accept(studentId, version);
    } catch (err) {
      if (primary !== memoryCocRepo) {
        console.warn(
          "[hybridCocRepo] Supabase CoC write failed, falling back to memory:",
          err instanceof Error ? err.message : err
        );
        return memoryCocRepo.accept(studentId, version);
      }
      throw err;
    }
  },

  revoke: async (studentId) => {
    const primary = pickRepo(studentId);
    try {
      return await primary.revoke(studentId);
    } catch (err) {
      if (primary !== memoryCocRepo) {
        console.warn(
          "[hybridCocRepo] Supabase CoC revoke failed, falling back to memory:",
          err instanceof Error ? err.message : err
        );
        return memoryCocRepo.revoke(studentId);
      }
      throw err;
    }
  },
};
