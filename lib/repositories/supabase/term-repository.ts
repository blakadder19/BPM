import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import type { MockTerm } from "@/lib/mock-data";
import type { Database } from "@/types/database";
import type { TermStatus } from "@/types/domain";
import type { ITermRepository, CreateTermData, TermPatch } from "../interfaces/term-repository";

type TermRow = Database["public"]["Tables"]["terms"]["Row"];

function toMockTerm(row: TermRow): MockTerm {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status as TermStatus,
    notes: null,
  };
}

export const supabaseTermRepo: ITermRepository = {
  async getAll() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("terms")
      .select("*")
      .order("start_date", { ascending: false });
    if (error) throw new Error(`Failed to load terms: ${error.message}`);
    return ((data ?? []) as TermRow[]).map(toMockTerm);
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("terms")
      .select("*")
      .eq("id", id)
      .single();
    return data ? toMockTerm(data as TermRow) : null;
  },

  async create(input: CreateTermData) {
    const supabase = createAdminClient();
    const academyId = await getAcademyId();
    const { data, error } = await supabase
      .from("terms")
      .insert({
        academy_id: academyId,
        name: input.name,
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toMockTerm(data as TermRow);
  },

  async update(id, patch: TermPatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.startDate !== undefined) fields.start_date = patch.startDate;
    if (patch.endDate !== undefined) fields.end_date = patch.endDate;
    if (patch.status !== undefined) fields.status = patch.status;

    if (Object.keys(fields).length === 0) return this.getById(id);

    const { error } = await supabase.from("terms").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getById(id);
  },

  async delete(id) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("terms").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
