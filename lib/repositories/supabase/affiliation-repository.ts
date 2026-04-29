import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { MockStudentAffiliation } from "@/lib/mock-data";
import type {
  AffiliationType,
  AffiliationVerificationStatus,
} from "@/lib/domain/pricing-engine";
import type {
  IAffiliationRepository,
  CreateAffiliationData,
  AffiliationPatch,
} from "../interfaces/affiliation-repository";

type Row = Database["public"]["Tables"]["student_affiliations"]["Row"];

function toMock(row: Row): MockStudentAffiliation {
  return {
    id: row.id,
    studentId: row.student_id,
    affiliationType: row.affiliation_type as AffiliationType,
    verificationStatus: row.verification_status as AffiliationVerificationStatus,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    metadata: row.metadata ?? {},
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseAffiliationRepo: IAffiliationRepository = {
  async getAll() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("student_affiliations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toMock);
  },

  async getByStudent(studentId) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("student_affiliations")
      .select("*")
      .eq("student_id", studentId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toMock);
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("student_affiliations")
      .select("*")
      .eq("id", id)
      .single();
    return data ? toMock(data as Row) : null;
  },

  async create(input: CreateAffiliationData) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("student_affiliations")
      .insert({
        student_id: input.studentId,
        affiliation_type: input.affiliationType,
        verification_status: input.verificationStatus ?? "pending",
        verified_at: input.verifiedAt ?? null,
        verified_by: input.verifiedBy ?? null,
        metadata: input.metadata ?? {},
        valid_from: input.validFrom ?? null,
        valid_until: input.validUntil ?? null,
        notes: input.notes ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toMock(data as Row);
  },

  async update(id, patch: AffiliationPatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.affiliationType !== undefined) fields.affiliation_type = patch.affiliationType;
    if (patch.verificationStatus !== undefined) fields.verification_status = patch.verificationStatus;
    if (patch.verifiedAt !== undefined) fields.verified_at = patch.verifiedAt;
    if (patch.verifiedBy !== undefined) fields.verified_by = patch.verifiedBy;
    if (patch.metadata !== undefined) fields.metadata = patch.metadata;
    if (patch.validFrom !== undefined) fields.valid_from = patch.validFrom;
    if (patch.validUntil !== undefined) fields.valid_until = patch.validUntil;
    if (patch.notes !== undefined) fields.notes = patch.notes;
    if (Object.keys(fields).length === 0) return this.getById(id);

    const { error } = await supabase
      .from("student_affiliations")
      .update(fields as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return this.getById(id);
  },

  async delete(id) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_affiliations")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
