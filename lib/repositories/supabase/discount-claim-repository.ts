import { createAdminClient } from "@/lib/supabase/admin";
import { generateId } from "@/lib/utils";
import type { Database } from "@/types/database";
import type {
  DiscountClaim,
  ClaimType,
} from "@/lib/services/discount-claim-store";
import type {
  IDiscountClaimRepository,
  ClaimAttemptResult,
  CreateClaimInput,
} from "../interfaces/discount-claim-repository";

type Row = Database["public"]["Tables"]["discount_claims"]["Row"];

function toMock(row: Row): DiscountClaim {
  return {
    id: row.id,
    studentId: row.student_id,
    claimType: row.claim_type as ClaimType,
    ruleId: row.rule_id,
    source: row.source as DiscountClaim["source"],
    relatedSubscriptionId: row.related_subscription_id,
    relatedSessionId: row.related_session_id,
    releasedAt: row.released_at,
    releasedReason: row.released_reason,
    claimedAt: row.claimed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findActiveByClaimType(
  studentId: string,
  claimType: string,
): Promise<DiscountClaim | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("discount_claims")
    .select("*")
    .eq("student_id", studentId)
    .eq("claim_type", claimType)
    .is("released_at", null)
    .maybeSingle();
  return data ? toMock(data as Row) : null;
}

async function findActiveByRule(
  studentId: string,
  ruleId: string,
): Promise<DiscountClaim | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("discount_claims")
    .select("*")
    .eq("student_id", studentId)
    .eq("rule_id", ruleId)
    .is("released_at", null)
    .maybeSingle();
  return data ? toMock(data as Row) : null;
}

export const supabaseDiscountClaimRepo: IDiscountClaimRepository = {
  async findActive(studentId, claimType) {
    return findActiveByClaimType(studentId, claimType);
  },

  async findActiveForRule(studentId, ruleId) {
    return findActiveByRule(studentId, ruleId);
  },

  async getActiveByStudent(studentId, claimType) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("discount_claims")
      .select("*")
      .eq("student_id", studentId)
      .eq("claim_type", claimType)
      .is("released_at", null);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toMock);
  },

  async tryCreate(input: CreateClaimInput): Promise<ClaimAttemptResult> {
    // Defensive pre-check: a legacy null-rule_id active row represents
    // "consumed first-time but for which rule is unknown". The new
    // partial unique index does not cover it, so we look it up
    // explicitly to keep the per-rule SCOPED insert from accidentally
    // re-granting a benefit the student already consumed pre-migration.
    if (input.ruleId) {
      const legacy = await findActiveByClaimType(
        input.studentId,
        input.claimType,
      );
      if (legacy && legacy.ruleId === null) {
        return { granted: false, claim: null, existingClaim: legacy };
      }
    }

    const supabase = createAdminClient();
    const id = input.id ?? generateId("dcl");
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("discount_claims")
      .insert({
        id,
        student_id: input.studentId,
        claim_type: input.claimType,
        rule_id: input.ruleId,
        source: input.source,
        related_subscription_id: input.relatedSubscriptionId ?? null,
        related_session_id: input.relatedSessionId ?? null,
        claimed_at: now,
        created_at: now,
        updated_at: now,
      } as never)
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation — either:
      //   * post-migration scoped path: (student_id, rule_id) partial unique
      //   * legacy path (rule_id IS NULL): (student_id, claim_type) partial unique
      if ((error as { code?: string }).code === "23505") {
        const existing = input.ruleId
          ? await findActiveByRule(input.studentId, input.ruleId)
          : await findActiveByClaimType(input.studentId, input.claimType);
        return { granted: false, claim: null, existingClaim: existing };
      }
      throw new Error(error.message);
    }

    return { granted: true, claim: toMock(data as Row), existingClaim: null };
  },

  async release(id, reason) {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("discount_claims")
      .update({
        released_at: now,
        released_reason: reason,
        updated_at: now,
      } as never)
      .eq("id", id)
      .is("released_at", null);
    if (error) throw new Error(error.message);
    return true;
  },

  async setRelated(id, patch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.relatedSubscriptionId !== undefined) {
      fields.related_subscription_id = patch.relatedSubscriptionId;
    }
    if (patch.relatedSessionId !== undefined) {
      fields.related_session_id = patch.relatedSessionId;
    }
    const { error } = await supabase
      .from("discount_claims")
      .update(fields as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("discount_claims")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? toMock(data as Row) : null;
  },
};
