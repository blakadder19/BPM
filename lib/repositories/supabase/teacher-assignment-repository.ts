import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import type { MockTeacherPair } from "@/lib/mock-data";

interface AssignmentRow {
  id: string;
  academy_id: string;
  class_id: string;
  class_title: string;
  teacher_1_id: string;
  teacher_2_id: string | null;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  created_at: string;
}

function toAssignment(row: AssignmentRow): MockTeacherPair {
  return {
    id: row.id,
    classId: row.class_id,
    classTitle: row.class_title,
    teacher1Id: row.teacher_1_id,
    teacher2Id: row.teacher_2_id,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    isActive: row.is_active,
  };
}

export const supabaseTeacherAssignmentRepo = {
  async getAll(): Promise<MockTeacherPair[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("teacher_default_assignments")
      .select("*")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data as AssignmentRow[]).map(toAssignment);
  },

  async create(data: {
    classId: string;
    classTitle: string;
    teacher1Id: string;
    teacher2Id: string | null;
    effectiveFrom: string;
    effectiveUntil: string | null;
    isActive: boolean;
  }): Promise<MockTeacherPair> {
    const supabase = createAdminClient();
    const academyId = await getAcademyId();
    const { data: row, error } = await supabase
      .from("teacher_default_assignments")
      .insert({
        academy_id: academyId,
        class_id: data.classId,
        class_title: data.classTitle,
        teacher_1_id: data.teacher1Id,
        teacher_2_id: data.teacher2Id,
        effective_from: data.effectiveFrom,
        effective_until: data.effectiveUntil,
        is_active: data.isActive,
      } as never)
      .select()
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return toAssignment(row as AssignmentRow);
  },

  async update(id: string, patch: Partial<{
    teacher1Id: string;
    teacher2Id: string | null;
    effectiveFrom: string;
    effectiveUntil: string | null;
    isActive: boolean;
  }>): Promise<MockTeacherPair | null> {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.teacher1Id !== undefined) fields.teacher_1_id = patch.teacher1Id;
    if (patch.teacher2Id !== undefined) fields.teacher_2_id = patch.teacher2Id;
    if (patch.effectiveFrom !== undefined) fields.effective_from = patch.effectiveFrom;
    if (patch.effectiveUntil !== undefined) fields.effective_until = patch.effectiveUntil;
    if (patch.isActive !== undefined) fields.is_active = patch.isActive;
    if (Object.keys(fields).length === 0) return null;
    const { data: row, error } = await supabase
      .from("teacher_default_assignments")
      .update(fields as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !row) return null;
    return toAssignment(row as AssignmentRow);
  },

  async delete(id: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("teacher_default_assignments")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
