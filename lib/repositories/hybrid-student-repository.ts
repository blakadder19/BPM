/**
 * Hybrid student repository — merges in-memory mock students with real
 * Supabase students when Supabase is configured.
 *
 * Priority:
 *   - getAll(): returns memory students + real Supabase students (deduplicated)
 *   - getById(): memory first, then Supabase
 *   - mutations: memory first, then Supabase (so real users can be updated)
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
    const memoryStudents = await memoryStudentRepo.getAll();
    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return memoryStudents;

    try {
      const realStudents = await sbRepo.getAll();
      const memIds = new Set(memoryStudents.map((s) => s.id));
      const additional = realStudents.filter((s) => !memIds.has(s.id));
      return [...memoryStudents, ...additional];
    } catch (err) {
      console.warn("[hybridStudentRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      return memoryStudents;
    }
  },

  async getById(id) {
    const memStudent = await memoryStudentRepo.getById(id);
    if (memStudent) return memStudent;

    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return null;

    try {
      return await sbRepo.getById(id);
    } catch (err) {
      console.warn("[hybridStudentRepo.getById] Supabase read failed:", err instanceof Error ? err.message : err);
      return null;
    }
  },

  async create(data: CreateStudentData) {
    return memoryStudentRepo.create(data);
  },

  async update(id, patch: StudentPatch) {
    const memResult = await memoryStudentRepo.update(id, patch);
    if (memResult) return memResult;

    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return null;

    try {
      return await sbRepo.update(id, patch);
    } catch (err) {
      console.warn("[hybridStudentRepo.update] Supabase write failed:", err instanceof Error ? err.message : err);
      return null;
    }
  },

  async toggleActive(id) {
    const memResult = await memoryStudentRepo.toggleActive(id);
    if (memResult) return memResult;

    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return null;

    try {
      return await sbRepo.toggleActive(id);
    } catch (err) {
      console.warn("[hybridStudentRepo.toggleActive] Supabase write failed:", err instanceof Error ? err.message : err);
      return null;
    }
  },
};
