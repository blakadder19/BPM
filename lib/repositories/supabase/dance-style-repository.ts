import { createAdminClient } from "@/lib/supabase/admin";
import type { MockDanceStyle } from "@/lib/mock-data";
import type { Database } from "@/types/database";
import type {
  CreateDanceStyleInput,
  IDanceStyleRepository,
} from "../interfaces/dance-style-repository";

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

  async findByName(name) {
    const supabase = createAdminClient();
    const needle = name.trim();
    // ilike with no wildcards == case-insensitive equality. Cheaper and
    // safer than fetching all rows and filtering in JS.
    const { data, error } = await supabase
      .from("dance_styles")
      .select("*")
      .ilike("name", needle)
      .limit(1);
    if (error) {
      throw new Error(`Failed to look up dance style: ${error.message}`);
    }
    const row = (data ?? [])[0] as StyleRow | undefined;
    return row ? toMockDanceStyle(row) : null;
  },

  async create(input: CreateDanceStyleInput) {
    const supabase = createAdminClient();
    const insertRow = {
      name: input.name.trim(),
      requires_role_balance: input.requiresRoleBalance ?? false,
      sort_order: input.sortOrder ?? 0,
      is_active: true,
    };
    const { data, error } = await supabase
      .from("dance_styles")
      .insert(insertRow as never)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Failed to create dance style: ${error.message}`);
    }
    return toMockDanceStyle(data as StyleRow);
  },
};
