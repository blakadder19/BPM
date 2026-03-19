/**
 * Hybrid subscription repository — merges in-memory mock subscriptions
 * with real Supabase subscriptions when Supabase is configured.
 *
 * Routing logic:
 *   - getAll() / getByStudent() / getById(): merge memory + Supabase, deduplicate by ID
 *   - create(): for real student UUIDs, try Supabase first (falls back to memory
 *     if FK constraints aren't satisfied yet, e.g. products table not migrated)
 *   - update(): memory first (most subscriptions live here), then Supabase
 *
 * Mock student IDs (s-*, dev-*) always go to memory only.
 */

import { memorySubscriptionRepo } from "./memory/subscription-repository";
import type {
  ISubscriptionRepository,
  CreateSubscriptionData,
  SubscriptionPatch,
} from "./interfaces/subscription-repository";

function isMockStudentId(id: string): boolean {
  return /^(s-|dev-)/.test(id);
}

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
    const memorySubs = await memorySubscriptionRepo.getAll();
    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return memorySubs;

    try {
      const realSubs = await sbRepo.getAll();
      const memIds = new Set(memorySubs.map((s) => s.id));
      const additional = realSubs.filter((s) => !memIds.has(s.id));
      return [...memorySubs, ...additional];
    } catch {
      return memorySubs;
    }
  },

  async getByStudent(studentId) {
    const memorySubs = await memorySubscriptionRepo.getByStudent(studentId);
    if (isMockStudentId(studentId)) return memorySubs;

    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return memorySubs;

    try {
      const realSubs = await sbRepo.getByStudent(studentId);
      const memIds = new Set(memorySubs.map((s) => s.id));
      const additional = realSubs.filter((s) => !memIds.has(s.id));
      return [...memorySubs, ...additional];
    } catch {
      return memorySubs;
    }
  },

  async getById(id) {
    const memSub = await memorySubscriptionRepo.getById(id);
    if (memSub) return memSub;

    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return null;

    try {
      return await sbRepo.getById(id);
    } catch {
      return null;
    }
  },

  async create(data: CreateSubscriptionData) {
    if (!isMockStudentId(data.studentId)) {
      const sbRepo = loadSupabaseRepo();
      if (sbRepo) {
        try {
          return await sbRepo.create(data);
        } catch {
          // FK constraints not satisfied (products/terms not in Supabase yet)
          // — fall through to memory
        }
      }
    }
    return memorySubscriptionRepo.create(data);
  },

  async update(id, patch: SubscriptionPatch) {
    const memResult = await memorySubscriptionRepo.update(id, patch);
    if (memResult) return memResult;

    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return null;

    try {
      return await sbRepo.update(id, patch);
    } catch {
      return null;
    }
  },
};
