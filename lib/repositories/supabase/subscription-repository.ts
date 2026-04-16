import { createAdminClient } from "@/lib/supabase/admin";
import type { MockSubscription } from "@/lib/mock-data";
import type { Database } from "@/types/database";
import type { PaymentMethod, ProductType, SubscriptionStatus } from "@/types/domain";
import type { ISubscriptionRepository, CreateSubscriptionData, SubscriptionPatch } from "../interfaces/subscription-repository";

type SubRow = Database["public"]["Tables"]["student_subscriptions"]["Row"];

function toMockSubscription(row: SubRow): MockSubscription {
  return {
    id: row.id,
    studentId: row.student_id,
    productId: row.product_id,
    productName: "",
    productType: "membership" as ProductType,
    status: row.status as SubscriptionStatus,
    totalCredits: row.total_credits,
    remainingCredits: row.remaining_credits,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    selectedStyleId: row.dance_style_id,
    selectedStyleName: row.selected_style_names?.[0] ?? null,
    selectedStyleIds: row.selected_style_ids,
    selectedStyleNames: row.selected_style_names,
    notes: row.notes,
    termId: row.term_id,
    paymentMethod: (row.payment_method ?? "manual") as PaymentMethod,
    paymentStatus: row.payment_status as MockSubscription["paymentStatus"],
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at ?? row.created_at,
    autoRenew: row.auto_renew,
    classesUsed: row.classes_used,
    classesPerTerm: row.classes_per_term,
    renewedFromId: row.renewed_from_id,
    paidAt: row.paid_at,
    paymentReference: row.payment_reference,
    paymentNotes: row.payment_notes,
    collectedBy: row.collected_by,
    priceCentsAtPurchase: row.price_cents_at_purchase,
    currencyAtPurchase: row.currency_at_purchase ?? "EUR",
    refundedAt: row.refunded_at,
    refundedBy: row.refunded_by,
    refundReason: row.refund_reason,
  };
}

function enrichWithProduct(sub: MockSubscription, product?: { name: string; product_type: string }): MockSubscription {
  if (product) {
    sub.productName = product.name;
    sub.productType = product.product_type as ProductType;
  }
  return sub;
}

export const supabaseSubscriptionRepo: ISubscriptionRepository = {
  async getAll() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("student_subscriptions")
      .select("*, products(name, product_type)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load subscriptions: ${error.message}`);

    return ((data ?? []) as (SubRow & { products?: { name: string; product_type: string } })[]).map((row) =>
      enrichWithProduct(toMockSubscription(row), row.products ?? undefined),
    );
  },

  async getByStudent(studentId) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("student_subscriptions")
      .select("*, products(name, product_type)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return ((data ?? []) as (SubRow & { products?: { name: string; product_type: string } })[]).map((row) =>
      enrichWithProduct(toMockSubscription(row), row.products ?? undefined),
    );
  },

  async getById(id) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("student_subscriptions")
      .select("*, products(name, product_type)")
      .eq("id", id)
      .single();
    if (!data) return null;

    const row = data as SubRow & { products?: { name: string; product_type: string } };
    return enrichWithProduct(toMockSubscription(row), row.products ?? undefined);
  },

  async create(input: CreateSubscriptionData) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("student_subscriptions")
      .insert({
        student_id: input.studentId,
        product_id: input.productId,
        status: input.status as SubRow["status"],
        total_credits: input.totalCredits,
        remaining_credits: input.remainingCredits,
        valid_from: input.validFrom,
        valid_until: input.validUntil,
        notes: input.notes,
        term_id: input.termId,
        payment_method: input.paymentMethod,
        payment_status: input.paymentStatus ?? "paid",
        assigned_by: input.assignedBy ?? null,
        assigned_at: input.assignedAt ?? new Date().toISOString(),
        auto_renew: input.autoRenew,
        classes_used: input.classesUsed,
        classes_per_term: input.classesPerTerm,
        selected_style_names: input.selectedStyleNames ?? (input.selectedStyleName ? [input.selectedStyleName] : null),
        selected_style_ids: input.selectedStyleIds ?? null,
        dance_style_id: input.selectedStyleId ?? null,
        renewed_from_id: input.renewedFromId ?? null,
        paid_at: input.paidAt ?? null,
        payment_reference: input.paymentReference ?? null,
        payment_notes: input.paymentNotes ?? null,
        collected_by: input.collectedBy ?? null,
        price_cents_at_purchase: input.priceCentsAtPurchase ?? null,
        currency_at_purchase: input.currencyAtPurchase ?? "EUR",
      } as never)
      .select("*, products(name, product_type)")
      .single();
    if (error) throw new Error(error.message);

    const row = data as SubRow & { products?: { name: string; product_type: string } };
    const sub = enrichWithProduct(toMockSubscription(row), row.products ?? undefined);
    if (!sub.productName) sub.productName = input.productName;
    if (sub.productType === "membership" && input.productType !== "membership") sub.productType = input.productType;
    return sub;
  },

  async update(id, patch: SubscriptionPatch) {
    const supabase = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.totalCredits !== undefined) fields.total_credits = patch.totalCredits;
    if (patch.remainingCredits !== undefined) fields.remaining_credits = patch.remainingCredits;
    if (patch.validFrom !== undefined) fields.valid_from = patch.validFrom;
    if (patch.validUntil !== undefined) fields.valid_until = patch.validUntil;
    if (patch.notes !== undefined) fields.notes = patch.notes;
    if (patch.termId !== undefined) fields.term_id = patch.termId;
    if (patch.paymentMethod !== undefined) fields.payment_method = patch.paymentMethod;
    if (patch.paymentStatus !== undefined) fields.payment_status = patch.paymentStatus;
    if (patch.autoRenew !== undefined) fields.auto_renew = patch.autoRenew;
    if (patch.classesUsed !== undefined) fields.classes_used = patch.classesUsed;
    if (patch.classesPerTerm !== undefined) fields.classes_per_term = patch.classesPerTerm;
    if (patch.selectedStyleId !== undefined) fields.dance_style_id = patch.selectedStyleId;
    if (patch.selectedStyleNames !== undefined) {
      fields.selected_style_names = patch.selectedStyleNames;
    } else if (patch.selectedStyleName !== undefined) {
      fields.selected_style_names = patch.selectedStyleName ? [patch.selectedStyleName] : null;
    }
    if (patch.selectedStyleIds !== undefined) fields.selected_style_ids = patch.selectedStyleIds;
    if (patch.renewedFromId !== undefined) fields.renewed_from_id = patch.renewedFromId;
    if (patch.paidAt !== undefined) fields.paid_at = patch.paidAt;
    if (patch.paymentReference !== undefined) fields.payment_reference = patch.paymentReference;
    if (patch.paymentNotes !== undefined) fields.payment_notes = patch.paymentNotes;
    if (patch.collectedBy !== undefined) fields.collected_by = patch.collectedBy;
    if (patch.refundedAt !== undefined) fields.refunded_at = patch.refundedAt;
    if (patch.refundedBy !== undefined) fields.refunded_by = patch.refundedBy;
    if (patch.refundReason !== undefined) fields.refund_reason = patch.refundReason;

    if (Object.keys(fields).length === 0) return this.getById(id);

    const { error } = await supabase.from("student_subscriptions").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getById(id);
  },

  async delete(id: string) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_subscriptions")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },
};
