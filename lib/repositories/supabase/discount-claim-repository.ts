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

async function findActiveRow(
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

export const supabaseDiscountClaimRepo: IDiscountClaimRepository = {
  async findActive(studentId, claimType) {
    return findActiveRow(studentId, claimType);
  },

  async tryCreate(input: CreateClaimInput): Promise<ClaimAttemptResult> {
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
      // 23505 = unique_violation — the partial unique index already
      // holds an active claim for (student_id, claim_type).
      if ((error as { code?: string }).code === "23505") {
        const existing = await findActiveRow(input.studentId, input.claimType);
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
