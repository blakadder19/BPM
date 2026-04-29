import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { MockDiscountRule } from "@/lib/mock-data";
import type {
  AffiliationType,
  DiscountKind,
  DiscountRuleType,
} from "@/lib/domain/pricing-engine";
import type { ProductType } from "@/types/domain";
import type {
  IDiscountRuleRepository,
  CreateDiscountRuleData,
  DiscountRulePatch,
} from "../interfaces/discount-rule-repository";

type Row = Database["public"]["Tables"]["discount_rules"]["Row"];

function toMock(row: Row): MockDiscountRule {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    ruleType: row.rule_type as DiscountRuleType,
    affiliationType: (row.affiliation_type as AffiliationType | null) ?? null,
    discountKind: row.discount_kind as DiscountKind,
    discountValue: row.discount_value,
    appliesToProductTypes: (row.applies_to_product_types as ProductType[] | null) ?? null,
    appliesToProductIds: row.applies_to_product_ids,
    minPriceCents: row.min_price_cents,
    maxDiscountCents: row.max_discount_cents,
    isActive: row.is_active,
    priority: row.priority,
    stackable: row.stackable,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseDiscountRuleRepo: IDiscountRuleRepository = {
  async getAll() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("discount_rules")
      .select("*")
      .order("priority", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toMock);
  },

  async getActive() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("discount_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Row[]).map(toMock);
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("discount_rules")
      .select("*")
      .eq("id", id)
      .single();
    return data ? toMock(data as Row) : null;
  },

  async create(input: CreateDiscountRuleData) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("discount_rules")
      .insert({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        rule_type: input.ruleType,
        affiliation_type: input.affiliationType ?? null,
        discount_kind: input.discountKind,
        discount_value: input.discountValue,
        applies_to_product_types: input.appliesToProductTypes ?? null,
        applies_to_product_ids: input.appliesToProductIds ?? null,
        min_price_cents: input.minPriceCents ?? null,
        max_discount_cents: input.maxDiscountCents ?? null,
        is_active: input.isActive ?? true,
        priority: input.priority ?? 0,
        stackable: input.stackable ?? false,
        valid_from: input.validFrom ?? null,
        valid_until: input.validUntil ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toMock(data as Row);
  },

  async update(id, patch: DiscountRulePatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.code !== undefined) fields.code = patch.code;
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.ruleType !== undefined) fields.rule_type = patch.ruleType;
    if (patch.affiliationType !== undefined) fields.affiliation_type = patch.affiliationType;
    if (patch.discountKind !== undefined) fields.discount_kind = patch.discountKind;
    if (patch.discountValue !== undefined) fields.discount_value = patch.discountValue;
    if (patch.appliesToProductTypes !== undefined)
      fields.applies_to_product_types = patch.appliesToProductTypes;
    if (patch.appliesToProductIds !== undefined)
      fields.applies_to_product_ids = patch.appliesToProductIds;
    if (patch.minPriceCents !== undefined) fields.min_price_cents = patch.minPriceCents;
    if (patch.maxDiscountCents !== undefined) fields.max_discount_cents = patch.maxDiscountCents;
    if (patch.isActive !== undefined) fields.is_active = patch.isActive;
    if (patch.priority !== undefined) fields.priority = patch.priority;
    if (patch.stackable !== undefined) fields.stackable = patch.stackable;
    if (patch.validFrom !== undefined) fields.valid_from = patch.validFrom;
    if (patch.validUntil !== undefined) fields.valid_until = patch.validUntil;
    if (Object.keys(fields).length === 0) return this.getById(id);

    const { error } = await supabase
      .from("discount_rules")
      .update(fields as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return this.getById(id);
  },

  async delete(id) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("discount_rules")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
