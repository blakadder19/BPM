import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import type { Teacher, TeacherCategory } from "@/lib/services/teacher-roster-store";

interface TeacherRow {
  id: string;
  academy_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toTeacher(row: TeacherRow): Teacher {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    category: (row.category as TeacherCategory) ?? null,
    isActive: row.is_active,
  };
}

export const supabaseTeacherRosterRepo = {
  async getAll(): Promise<Teacher[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("teacher_roster")
      .select("*")
      .order("full_name");
    if (error) throw new Error(error.message);
    return (data as TeacherRow[]).map(toTeacher);
  },

  async create(data: {
    fullName: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    category?: TeacherCategory;
    isActive: boolean;
  }): Promise<Teacher> {
    const supabase = createAdminClient();
    const academyId = await getAcademyId();
    const { data: row, error } = await supabase
      .from("teacher_roster")
      .insert({
        academy_id: academyId,
        full_name: data.fullName,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
        category: data.category ?? null,
        is_active: data.isActive,
      } as never)
      .select()
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return toTeacher(row as TeacherRow);
  },

  async update(id: string, patch: Partial<{
    fullName: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    category: TeacherCategory;
    isActive: boolean;
  }>): Promise<Teacher | null> {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.fullName !== undefined) fields.full_name = patch.fullName;
    if (patch.email !== undefined) fields.email = patch.email;
    if (patch.phone !== undefined) fields.phone = patch.phone;
    if (patch.notes !== undefined) fields.notes = patch.notes;
    if (patch.category !== undefined) fields.category = patch.category;
    if (patch.isActive !== undefined) fields.is_active = patch.isActive;
    if (Object.keys(fields).length === 0) return null;
    const { data: row, error } = await supabase
      .from("teacher_roster")
      .update(fields as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !row) return null;
    return toTeacher(row as TeacherRow);
  },

  async delete(id: string): Promise<boolean> {
    const supabase = createAdminClient();
    const { error } = await supabase.from("teacher_roster").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
