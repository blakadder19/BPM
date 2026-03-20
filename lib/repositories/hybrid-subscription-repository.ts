/**
 * Hybrid subscription repository — merges in-memory mock subscriptions
 * with real Supabase subscriptions when Supabase is configured.
 *
 * Current state: products and terms only exist in memory (not yet
 * migrated to Supabase as seed data), so subscriptions for ALL users
 * (mock and real) are stored in memory. Supabase reads are merged in
 * for any that may exist there.
 *
 * When products/terms are seeded in Supabase, the create() path can
 * be updated to prefer Supabase for real users.
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
    const memorySubs = await memorySubscriptionRepo.getAll();
    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return memorySubs;

    try {
      const realSubs = await sbRepo.getAll();
      const memIds = new Set(memorySubs.map((s) => s.id));
      const additional = realSubs.filter((s) => !memIds.has(s.id));
      return [...memorySubs, ...additional];
    } catch (err) {
      console.warn("[hybridSubscriptionRepo.getAll] Supabase read failed:", err instanceof Error ? err.message : err);
      return memorySubs;
    }
  },

  async getByStudent(studentId) {
    const memorySubs = await memorySubscriptionRepo.getByStudent(studentId);
    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return memorySubs;

    try {
      const realSubs = await sbRepo.getByStudent(studentId);
      const memIds = new Set(memorySubs.map((s) => s.id));
      const additional = realSubs.filter((s) => !memIds.has(s.id));
      return [...memorySubs, ...additional];
    } catch (err) {
      console.warn("[hybridSubscriptionRepo.getByStudent] Supabase read failed:", err instanceof Error ? err.message : err);
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
    } catch (err) {
      console.warn("[hybridSubscriptionRepo.getById] Supabase read failed:", err instanceof Error ? err.message : err);
      return null;
    }
  },

  async create(data: CreateSubscriptionData) {
    // Products/terms are not yet seeded in Supabase, so all subscriptions
    // go to memory. This works for both mock and real student IDs because
    // the subscription service identifies students by UUID string, not by
    // where the student row lives.
    return memorySubscriptionRepo.create(data);
  },

  async update(id, patch: SubscriptionPatch) {
    const memResult = await memorySubscriptionRepo.update(id, patch);
    if (memResult) return memResult;

    const sbRepo = loadSupabaseRepo();
    if (!sbRepo) return null;

    try {
      return await sbRepo.update(id, patch);
    } catch (err) {
      console.warn("[hybridSubscriptionRepo.update] Supabase write failed:", err instanceof Error ? err.message : err);
      return null;
    }
  },
};
