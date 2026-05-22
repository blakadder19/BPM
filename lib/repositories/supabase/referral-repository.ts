/**
 * Supabase-backed referral repository (Phase 3 MVP).
 *
 * The matching DB schema is created in migration 00067_referrals.sql.
 * Because the generated `types/database.ts` may not yet contain the
 * new tables, we deliberately use untyped admin-client calls — the
 * shapes here are authoritative and match the migration exactly.
 *
 * Referral codes live as a nullable column on `users` and are
 * allocated lazily on first read (mirrors `student_qr_token`).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MockStudentReferral,
  MockReferralReward,
  ReferralStatus,
  ReferralRewardStatus,
  ReferralDiscountKind,
} from "@/lib/mock-data";
import type {
  IReferralRepository,
  CreateReferralData,
  ReferralPatch,
  CreateRewardData,
  RewardPatch,
} from "../interfaces/referral-repository";

// ── code allocation ────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `BPM-${out}`;
}

interface ReferralRow {
  id: string;
  referrer_student_id: string;
  referred_student_id: string | null;
  referred_email: string | null;
  referral_code: string | null;
  status: string;
  verified_at: string | null;
  verified_by: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface RewardRow {
  id: string;
  referrer_student_id: string;
  term_id: string | null;
  verified_referral_count: number;
  reward_type: string;
  discount_kind: string;
  discount_value: number;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  applied_subscription_id: string | null;
  applied_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function toReferral(row: ReferralRow): MockStudentReferral {
  return {
    id: row.id,
    referrerStudentId: row.referrer_student_id,
    referredStudentId: row.referred_student_id,
    referredEmail: row.referred_email,
    referralCode: row.referral_code,
    status: row.status as ReferralStatus,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toReward(row: RewardRow): MockReferralReward {
  return {
    id: row.id,
    referrerStudentId: row.referrer_student_id,
    termId: row.term_id,
    verifiedReferralCount: row.verified_referral_count,
    rewardType: "membership_discount",
    discountKind: row.discount_kind as ReferralDiscountKind,
    discountValue: row.discount_value,
    status: row.status as ReferralRewardStatus,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    appliedSubscriptionId: row.applied_subscription_id,
    appliedAt: row.applied_at,
    cancelledAt: row.cancelled_at,
    cancelledReason: row.cancelled_reason,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseReferralRepo: IReferralRepository = {
  async getCodeForStudent(studentId) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { referral_code: string | null } | null; error: { message: string } | null }>;
          };
        };
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const existing = await sb.from("users").select("referral_code").eq("id", studentId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.referral_code) return existing.data.referral_code;

    // Allocate; retry on lower-case unique-index collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = randomCode();
      const updated = await sb
        .from("users")
        .update({ referral_code: candidate })
        .eq("id", studentId);
      if (!updated.error) return candidate;
      // unique violation — retry
      if (!/duplicate|unique/i.test(updated.error.message)) {
        throw new Error(updated.error.message);
      }
    }
    throw new Error("Could not allocate a unique referral code after 5 attempts");
  },

  async getAllCodes() {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          not: (col: string, op: string, v: unknown) => Promise<{ data: Array<{ id: string; referral_code: string | null }> | null; error: { message: string } | null }>;
        };
      };
    };
    const { data, error } = await sb.from("users").select("id,referral_code").not("referral_code", "is", null);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter((r) => r.referral_code)
      .map((r) => ({ studentId: r.id, code: r.referral_code as string }));
  },

  async findStudentByCode(code) {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          ilike: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await sb.from("users").select("id").ilike("referral_code", trimmed).maybeSingle();
    if (error && !/no rows/i.test(error.message)) throw new Error(error.message);
    return data?.id ?? null;
  },

  async getAllReferrals() {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: ReferralRow[] | null; error: { message: string } | null }>;
        };
      };
    };
    const { data, error } = await sb.from("student_referrals").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toReferral);
  },

  async getReferralsByReferrer(referrerId) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => Promise<{ data: ReferralRow[] | null; error: { message: string } | null }>;
        };
      };
    };
    const { data, error } = await sb.from("student_referrals").select("*").eq("referrer_student_id", referrerId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toReferral);
  },

  async getReferralById(id) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: ReferralRow | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data } = await sb.from("student_referrals").select("*").eq("id", id).maybeSingle();
    return data ? toReferral(data) : null;
  },

  async createReferral(input: CreateReferralData) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: () => {
            single: () => Promise<{ data: ReferralRow | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await sb
      .from("student_referrals")
      .insert({
        referrer_student_id: input.referrerStudentId,
        referred_student_id: input.referredStudentId ?? null,
        referred_email: input.referredEmail?.toLowerCase() ?? null,
        referral_code: input.referralCode ?? null,
        status: input.status ?? "pending",
        note: input.note ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("createReferral returned no row");
    return toReferral(data);
  },

  async updateReferral(id, patch: ReferralPatch) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const fields: Record<string, unknown> = {};
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.referredStudentId !== undefined) fields.referred_student_id = patch.referredStudentId;
    if (patch.referredEmail !== undefined) fields.referred_email = patch.referredEmail?.toLowerCase() ?? null;
    if (patch.note !== undefined) fields.note = patch.note;
    if (patch.verifiedAt !== undefined) fields.verified_at = patch.verifiedAt;
    if (patch.verifiedBy !== undefined) fields.verified_by = patch.verifiedBy;
    if (Object.keys(fields).length === 0) return this.getReferralById(id);
    fields.updated_at = new Date().toISOString();
    const { error } = await sb.from("student_referrals").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getReferralById(id);
  },

  async deleteReferral(id) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const { error } = await sb.from("student_referrals").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  async getAllRewards() {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (col: string, opts: { ascending: boolean }) => Promise<{ data: RewardRow[] | null; error: { message: string } | null }>;
        };
      };
    };
    const { data, error } = await sb.from("referral_rewards").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toReward);
  },

  async getRewardsByReferrer(referrerId) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => Promise<{ data: RewardRow[] | null; error: { message: string } | null }>;
        };
      };
    };
    const { data, error } = await sb.from("referral_rewards").select("*").eq("referrer_student_id", referrerId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toReward);
  },

  async getRewardById(id) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: RewardRow | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data } = await sb.from("referral_rewards").select("*").eq("id", id).maybeSingle();
    return data ? toReward(data) : null;
  },

  async createReward(input: CreateRewardData) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => {
          select: () => {
            single: () => Promise<{ data: RewardRow | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await sb
      .from("referral_rewards")
      .insert({
        referrer_student_id: input.referrerStudentId,
        term_id: input.termId ?? null,
        verified_referral_count: input.verifiedReferralCount,
        reward_type: "membership_discount",
        discount_kind: input.discountKind,
        discount_value: input.discountValue,
        status: input.status ?? "pending",
        note: input.note ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("createReward returned no row");
    return toReward(data);
  },

  async updateReward(id, patch: RewardPatch) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const fields: Record<string, unknown> = {};
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.termId !== undefined) fields.term_id = patch.termId;
    if (patch.discountKind !== undefined) fields.discount_kind = patch.discountKind;
    if (patch.discountValue !== undefined) fields.discount_value = patch.discountValue;
    if (patch.note !== undefined) fields.note = patch.note;
    if (patch.approvedBy !== undefined) fields.approved_by = patch.approvedBy;
    if (patch.approvedAt !== undefined) fields.approved_at = patch.approvedAt;
    if (patch.appliedSubscriptionId !== undefined) fields.applied_subscription_id = patch.appliedSubscriptionId;
    if (patch.appliedAt !== undefined) fields.applied_at = patch.appliedAt;
    if (patch.cancelledAt !== undefined) fields.cancelled_at = patch.cancelledAt;
    if (patch.cancelledReason !== undefined) fields.cancelled_reason = patch.cancelledReason;
    if (Object.keys(fields).length === 0) return this.getRewardById(id);
    fields.updated_at = new Date().toISOString();
    const { error } = await sb.from("referral_rewards").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getRewardById(id);
  },

  async deleteReward(id) {
    const supabase = createAdminClient();
    const sb = supabase as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const { error } = await sb.from("referral_rewards").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
