import { createAdminClient } from "@/lib/supabase/admin";
import type { MockDanceStyle } from "@/lib/mock-data";
import type { Database } from "@/types/database";
import type { IDanceStyleRepository } from "../interfaces/dance-style-repository";

type StyleRow = Database["public"]["Tables"]["dance_styles"]["Row"];

function toMockDanceStyle(row: StyleRow): MockDanceStyle {
  return {
    id: row.id,
    name: row.name,
    description: null,
    requiresRoleBalance: row.requires_role_balance,
  };
}

export const supabaseDanceStyleRepo: IDanceStyleRepository = {
  async getAll() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("dance_styles")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(`Failed to load dance styles: ${error.message}`);
    return ((data ?? []) as StyleRow[]).map(toMockDanceStyle);
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("dance_styles")
      .select("*")
      .eq("id", id)
      .single();
    return data ? toMockDanceStyle(data as StyleRow) : null;
  },
};
