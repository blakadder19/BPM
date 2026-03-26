import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import type { MockProduct } from "@/lib/mock-data";
import type { Database } from "@/types/database";
import type { CreditsModel, ProductType } from "@/types/domain";
import type { IProductRepository, CreateProductData, ProductPatch } from "../interfaces/product-repository";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

function toMockProduct(row: ProductRow): MockProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    longDescription: row.long_description ?? null,
    productType: row.product_type as ProductType,
    priceCents: row.price_cents,
    totalCredits: row.total_credits,
    durationDays: row.duration_days,
    styleName: null,
    allowedLevels: row.allowed_levels,
    allowedStyleIds: (row as Record<string, unknown>).allowed_style_ids as string[] | null ?? null,
    allowedStyleNames: (row as Record<string, unknown>).allowed_style_names as string[] | null ?? null,
    isActive: row.is_active,
    isProvisional: row.is_provisional,
    notes: row.notes ?? null,
    validityDescription: row.validity_description ?? null,
    creditsModel: (row.credits_model ?? "fixed") as CreditsModel,
    termBound: row.term_bound,
    recurring: row.recurring,
    classesPerTerm: row.classes_per_term,
    autoRenew: row.auto_renew,
    benefits: row.benefits,
  };
}

export const supabaseProductRepo: IProductRepository = {
  async getAll() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name");
    if (error) throw new Error(`Failed to load products: ${error.message}`);
    return ((data ?? []) as ProductRow[]).map(toMockProduct);
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .single();
    return data ? toMockProduct(data as ProductRow) : null;
  },

  async create(input: CreateProductData) {
    const supabase = createAdminClient();
    const academyId = await getAcademyId();
    const { data, error } = await supabase
      .from("products")
      .insert({
        academy_id: academyId,
        name: input.name,
        description: input.description,
        long_description: input.longDescription ?? null,
        product_type: input.productType as ProductRow["product_type"],
        price_cents: input.priceCents,
        total_credits: input.totalCredits,
        duration_days: input.durationDays,
        allowed_levels: input.allowedLevels,
        allowed_style_ids: input.allowedStyleIds,
        allowed_style_names: input.allowedStyleNames,
        is_provisional: input.isProvisional,
        notes: input.notes,
        validity_description: input.validityDescription,
        credits_model: input.creditsModel,
        term_bound: input.termBound ?? false,
        recurring: input.recurring ?? false,
        classes_per_term: input.classesPerTerm ?? null,
        auto_renew: input.autoRenew ?? false,
        benefits: input.benefits ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toMockProduct(data as ProductRow);
  },

  async update(id, patch: ProductPatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.longDescription !== undefined) fields.long_description = patch.longDescription;
    if (patch.priceCents !== undefined) fields.price_cents = patch.priceCents;
    if (patch.totalCredits !== undefined) fields.total_credits = patch.totalCredits;
    if (patch.durationDays !== undefined) fields.duration_days = patch.durationDays;
    if (patch.allowedLevels !== undefined) fields.allowed_levels = patch.allowedLevels;
    if (patch.allowedStyleIds !== undefined) fields.allowed_style_ids = patch.allowedStyleIds;
    if (patch.allowedStyleNames !== undefined) fields.allowed_style_names = patch.allowedStyleNames;
    if (patch.isProvisional !== undefined) fields.is_provisional = patch.isProvisional;
    if (patch.notes !== undefined) fields.notes = patch.notes;
    if (patch.validityDescription !== undefined) fields.validity_description = patch.validityDescription;
    if (patch.creditsModel !== undefined) fields.credits_model = patch.creditsModel;
    if (patch.termBound !== undefined) fields.term_bound = patch.termBound;
    if (patch.recurring !== undefined) fields.recurring = patch.recurring;
    if (patch.classesPerTerm !== undefined) fields.classes_per_term = patch.classesPerTerm;
    if (patch.autoRenew !== undefined) fields.auto_renew = patch.autoRenew;
    if (patch.benefits !== undefined) fields.benefits = patch.benefits;
    if (patch.isActive !== undefined) fields.is_active = patch.isActive;

    if (Object.keys(fields).length === 0) return this.getById(id);

    const { error } = await supabase.from("products").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getById(id);
  },

  async toggleActive(id) {
    const supabase = createAdminClient();
    const { data: current } = await supabase
      .from("products")
      .select("is_active")
      .eq("id", id)
      .single();
    if (!current) return null;

    const { error } = await supabase
      .from("products")
      .update({ is_active: !(current as ProductRow).is_active } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return this.getById(id);
  },

  async delete(id) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
