/**
 * Hybrid student repository.
 *
 * When Supabase is configured, reads/writes go to Supabase directly.
 * Memory store is only used as the primary source when Supabase is absent.
 */

import { memoryStudentRepo } from "./memory/student-repository";
import type {
  IStudentRepository,
  CreateStudentData,
  StudentPatch,
} from "./interfaces/student-repository";

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function loadSupabaseRepo(): IStudentRepository | null {
  if (!hasSupabaseConfig()) return null;
  try {
    const { supabaseStudentRepo } = require("./supabase/student-repository");
    return supabaseStudentRepo as IStudentRepository;
  } catch {
    return null;
  }
}

export const hybridStudentRepo: IStudentRepository = {
  async getAll() {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.getAll();
      } catch (err) {
        console.warn("[hybridStudentRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryStudentRepo.getAll();
  },

  async getById(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const found = await sbRepo.getById(id);
        if (found) return found;
      } catch (err) {
        console.warn("[hybridStudentRepo.getById] Supabase read failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryStudentRepo.getById(id);
  },

  async create(data: CreateStudentData) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      return await sbRepo.create(data);
    }
    return memoryStudentRepo.create(data);
  },

  async update(id, patch: StudentPatch) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const result = await sbRepo.update(id, patch);
        if (result) return result;
      } catch (err) {
        console.warn("[hybridStudentRepo.update] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryStudentRepo.update(id, patch);
  },

  async delete(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        return await sbRepo.delete(id);
      } catch (err) {
        console.warn("[hybridStudentRepo.delete] Supabase delete failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryStudentRepo.delete(id);
  },

  async toggleActive(id) {
    const sbRepo = loadSupabaseRepo();
    if (sbRepo) {
      try {
        const result = await sbRepo.toggleActive(id);
        if (result) return result;
      } catch (err) {
        console.warn("[hybridStudentRepo.toggleActive] Supabase write failed:", err instanceof Error ? err.message : err);
      }
    }
    return memoryStudentRepo.toggleActive(id);
  },
};
