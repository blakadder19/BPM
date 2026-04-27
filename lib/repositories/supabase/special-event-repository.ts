import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import type {
  MockSpecialEvent,
  MockEventSession,
  MockEventProduct,
  MockEventPurchase,
} from "@/lib/mock-data";
import type {
  EventStatus,
  EventSessionType,
  EventProductType,
  EventInclusionRule,
  EventPaymentMethod,
  EventPaymentStatus,
} from "@/types/domain";
import type {
  ISpecialEventRepository,
  CreateEventData,
  EventPatch,
  CreateSessionData,
  SessionPatch,
  CreateEventProductData,
  EventProductPatch,
  CreatePurchaseData,
} from "../interfaces/special-event-repository";

// ── Helpers ───────────────────────────────────────────────────

/**
 * Normalize a timestamptz string from Supabase into a clean ISO datetime
 * without timezone offset (we store everything as UTC-like for display).
 */
function normalizeEventDT(val: string | null | undefined): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toISOString().replace("Z", "").replace(/\.000$/, "");
}

// ── Row mappers ──────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEvent(r: any): MockSpecialEvent {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle ?? null,
    description: r.description ?? "",
    coverImageUrl: r.cover_image_url ?? null,
    location: r.location ?? "",
    startDate: normalizeEventDT(r.start_date),
    endDate: normalizeEventDT(r.end_date),
    status: r.status as EventStatus,
    isVisible: r.is_visible,
    isFeatured: r.is_featured,
    featuredOnDashboard: r.featured_on_dashboard ?? false,
    isPublic: r.is_public ?? false,
    salesOpen: r.sales_open,
    overallCapacity: r.overall_capacity ?? null,
    allowReceptionPayment: r.allow_reception_payment ?? false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSession(r: any): MockEventSession {
  return {
    id: r.id,
    eventId: r.event_id,
    title: r.title,
    sessionType: r.session_type as EventSessionType,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    teacherName: r.teacher_name ?? null,
    room: r.room ?? null,
    capacity: r.capacity ?? null,
    description: r.description ?? null,
    sortOrder: r.sort_order ?? 0,
  };
}

function toProduct(r: any): MockEventProduct {
  return {
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    description: r.description ?? null,
    priceCents: r.price_cents,
    productType: r.product_type as EventProductType,
    isVisible: r.is_visible,
    salesOpen: r.sales_open,
    inclusionRule: r.inclusion_rule as EventInclusionRule,
    includedSessionIds: r.included_session_ids ?? null,
    sortOrder: r.sort_order ?? 0,
  };
}

function toPurchase(r: any): MockEventPurchase {
  return {
    id: r.id,
    studentId: r.student_id ?? null,
    eventProductId: r.event_product_id,
    eventId: r.event_id,
    guestName: r.guest_name ?? null,
    guestEmail: r.guest_email ?? null,
    guestPhone: r.guest_phone ?? null,
    qrToken: r.qr_token ?? null,
    paymentMethod: r.payment_method as EventPaymentMethod,
    paymentStatus: r.payment_status as EventPaymentStatus,
    paymentReference: r.payment_reference ?? null,
    receptionMethod: r.reception_method ?? null,
    purchasedAt: r.purchased_at,
    paidAt: r.paid_at ?? null,
    notes: r.notes ?? null,
    unitPriceCentsAtPurchase: r.unit_price_cents_at_purchase ?? null,
    originalAmountCents: r.original_amount_cents ?? null,
    discountAmountCents: r.discount_amount_cents ?? null,
    paidAmountCents: r.paid_amount_cents ?? null,
    currency: r.currency ?? null,
    productNameSnapshot: r.product_name_snapshot ?? null,
    productTypeSnapshot: r.product_type_snapshot ?? null,
    checkedInAt: r.checked_in_at ?? null,
    checkedInBy: r.checked_in_by ?? null,
    refundedAt: r.refunded_at ?? null,
    refundedBy: r.refunded_by ?? null,
    refundReason: r.refund_reason ?? null,
    lastEmailType: r.last_email_type ?? null,
    lastEmailSentAt: r.last_email_sent_at ?? null,
    lastEmailSuccess: r.last_email_success ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Repository ───────────────────────────────────────────────

export const supabaseSpecialEventRepo: ISpecialEventRepository = {
  // ── Events ─────────────────────────────────────────────
  async getAllEvents() {
    const sb = createAdminClient();
    const { data, error } = await sb.from("special_events").select("*").order("start_date", { ascending: false });
    if (error) throw new Error(`Failed to load events: ${error.message}`);
    return (data ?? []).map(toEvent);
  },

  async getEventById(id) {
    const sb = createAdminClient();
    const { data } = await sb.from("special_events").select("*").eq("id", id).single();
    return data ? toEvent(data) : null;
  },

  async createEvent(input: CreateEventData) {
    const sb = createAdminClient();
    const academyId = await getAcademyId();
    const { data, error } = await sb
      .from("special_events")
      .insert({
        academy_id: academyId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        description: input.description,
        cover_image_url: input.coverImageUrl ?? null,
        location: input.location,
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status ?? "draft",
        is_visible: input.isVisible ?? false,
        is_featured: input.isFeatured ?? false,
        featured_on_dashboard: input.featuredOnDashboard ?? false,
        is_public: input.isPublic ?? false,
        sales_open: input.salesOpen ?? false,
        overall_capacity: input.overallCapacity ?? null,
        allow_reception_payment: input.allowReceptionPayment ?? false,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toEvent(data);
  },

  async updateEvent(id, patch: EventPatch) {
    const sb = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.subtitle !== undefined) fields.subtitle = patch.subtitle;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.coverImageUrl !== undefined) fields.cover_image_url = patch.coverImageUrl;
    if (patch.location !== undefined) fields.location = patch.location;
    if (patch.startDate !== undefined) fields.start_date = patch.startDate;
    if (patch.endDate !== undefined) fields.end_date = patch.endDate;
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.isVisible !== undefined) fields.is_visible = patch.isVisible;
    if (patch.isFeatured !== undefined) fields.is_featured = patch.isFeatured;
    if (patch.featuredOnDashboard !== undefined) fields.featured_on_dashboard = patch.featuredOnDashboard;
    if (patch.isPublic !== undefined) fields.is_public = patch.isPublic;
    if (patch.salesOpen !== undefined) fields.sales_open = patch.salesOpen;
    if (patch.overallCapacity !== undefined) fields.overall_capacity = patch.overallCapacity;
    if (patch.allowReceptionPayment !== undefined) fields.allow_reception_payment = patch.allowReceptionPayment;
    if (Object.keys(fields).length === 0) return this.getEventById(id);
    const { error } = await sb.from("special_events").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    return this.getEventById(id);
  },

  async deleteEvent(id) {
    const sb = createAdminClient();
    const { error } = await sb.from("special_events").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  // ── Sessions ───────────────────────────────────────────
  async getSessionsByEvent(eventId) {
    const sb = createAdminClient();
    const { data, error } = await sb.from("event_sessions").select("*").eq("event_id", eventId).order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSession);
  },

  async createSession(input: CreateSessionData) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("event_sessions")
      .insert({
        event_id: input.eventId,
        title: input.title,
        session_type: input.sessionType,
        date: input.date,
        start_time: input.startTime,
        end_time: input.endTime,
        teacher_name: input.teacherName ?? null,
        room: input.room ?? null,
        capacity: input.capacity ?? null,
        description: input.description ?? null,
        sort_order: input.sortOrder ?? 0,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toSession(data);
  },

  async updateSession(id, patch: SessionPatch) {
    const sb = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields.title = patch.title;
    if (patch.sessionType !== undefined) fields.session_type = patch.sessionType;
    if (patch.date !== undefined) fields.date = patch.date;
    if (patch.startTime !== undefined) fields.start_time = patch.startTime;
    if (patch.endTime !== undefined) fields.end_time = patch.endTime;
    if (patch.teacherName !== undefined) fields.teacher_name = patch.teacherName;
    if (patch.room !== undefined) fields.room = patch.room;
    if (patch.capacity !== undefined) fields.capacity = patch.capacity;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.sortOrder !== undefined) fields.sort_order = patch.sortOrder;
    if (Object.keys(fields).length === 0) return null;
    const { error } = await sb.from("event_sessions").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    const { data } = await sb.from("event_sessions").select("*").eq("id", id).single();
    return data ? toSession(data) : null;
  },

  async deleteSession(id) {
    const sb = createAdminClient();
    const { error } = await sb.from("event_sessions").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  // ── Event Products ─────────────────────────────────────
  async getProductsByEvent(eventId) {
    const sb = createAdminClient();
    const { data, error } = await sb.from("event_products").select("*").eq("event_id", eventId).order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map(toProduct);
  },

  async createEventProduct(input: CreateEventProductData) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("event_products")
      .insert({
        event_id: input.eventId,
        name: input.name,
        description: input.description ?? null,
        price_cents: input.priceCents,
        product_type: input.productType,
        is_visible: input.isVisible ?? true,
        sales_open: input.salesOpen ?? false,
        inclusion_rule: input.inclusionRule,
        included_session_ids: input.includedSessionIds ?? null,
        sort_order: input.sortOrder ?? 0,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toProduct(data);
  },

  async updateEventProduct(id, patch: EventProductPatch) {
    const sb = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.description !== undefined) fields.description = patch.description;
    if (patch.priceCents !== undefined) fields.price_cents = patch.priceCents;
    if (patch.productType !== undefined) fields.product_type = patch.productType;
    if (patch.isVisible !== undefined) fields.is_visible = patch.isVisible;
    if (patch.salesOpen !== undefined) fields.sales_open = patch.salesOpen;
    if (patch.inclusionRule !== undefined) fields.inclusion_rule = patch.inclusionRule;
    if (patch.includedSessionIds !== undefined) fields.included_session_ids = patch.includedSessionIds;
    if (patch.sortOrder !== undefined) fields.sort_order = patch.sortOrder;
    if (Object.keys(fields).length === 0) return null;
    const { error } = await sb.from("event_products").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    const { data } = await sb.from("event_products").select("*").eq("id", id).single();
    return data ? toProduct(data) : null;
  },

  async deleteEventProduct(id) {
    const sb = createAdminClient();
    const { error } = await sb.from("event_products").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  // ── Purchases ──────────────────────────────────────────
  async getPurchasesByEvent(eventId) {
    const sb = createAdminClient();
    const { data, error } = await sb.from("event_purchases").select("*").eq("event_id", eventId).order("purchased_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPurchase);
  },

  async getPurchasesByStudent(studentId) {
    const sb = createAdminClient();
    const { data, error } = await sb.from("event_purchases").select("*").eq("student_id", studentId).order("purchased_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPurchase);
  },

  async getPurchaseByQrToken(token) {
    const sb = createAdminClient();
    const { data } = await sb.from("event_purchases").select("*").eq("qr_token", token).single();
    return data ? toPurchase(data) : null;
  },

  async getPurchaseById(id) {
    const sb = createAdminClient();
    const { data } = await sb.from("event_purchases").select("*").eq("id", id).maybeSingle();
    return data ? toPurchase(data) : null;
  },

  async getAllPurchases() {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("event_purchases")
      .select("*")
      .order("purchased_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toPurchase);
  },

  async createPurchase(input: CreatePurchaseData) {
    const sb = createAdminClient();
    const { data, error } = await sb
      .from("event_purchases")
      .insert({
        student_id: input.studentId,
        event_product_id: input.eventProductId,
        event_id: input.eventId,
        guest_name: input.guestName ?? null,
        guest_email: input.guestEmail ?? null,
        guest_phone: input.guestPhone ?? null,
        qr_token: input.qrToken ?? null,
        payment_method: input.paymentMethod,
        payment_status: input.paymentStatus ?? "pending",
        payment_reference: input.paymentReference ?? null,
        paid_at: input.paidAt ?? null,
        notes: input.notes ?? null,
        unit_price_cents_at_purchase: input.unitPriceCentsAtPurchase ?? null,
        original_amount_cents: input.originalAmountCents ?? null,
        discount_amount_cents: input.discountAmountCents ?? 0,
        paid_amount_cents: input.paidAmountCents ?? null,
        currency: input.currency ?? "eur",
        product_name_snapshot: input.productNameSnapshot ?? null,
        product_type_snapshot: input.productTypeSnapshot ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toPurchase(data);
  },

  async updatePurchasePayment(id, patch) {
    const sb = createAdminClient();
    const fields: Record<string, unknown> = { payment_status: patch.paymentStatus };
    if (patch.paymentReference !== undefined) fields.payment_reference = patch.paymentReference;
    if (patch.receptionMethod !== undefined) fields.reception_method = patch.receptionMethod;
    if (patch.paidAt !== undefined) fields.paid_at = patch.paidAt;
    if (patch.qrToken !== undefined) fields.qr_token = patch.qrToken;
    if (patch.paidAmountCents !== undefined) fields.paid_amount_cents = patch.paidAmountCents;
    const { error } = await sb.from("event_purchases").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    const { data } = await sb.from("event_purchases").select("*").eq("id", id).single();
    return data ? toPurchase(data) : null;
  },

  async updatePurchaseCheckIn(id, patch) {
    const sb = createAdminClient();
    const { error } = await sb.from("event_purchases").update({
      checked_in_at: patch.checkedInAt,
      checked_in_by: patch.checkedInBy,
    } as never).eq("id", id);
    if (error) throw new Error(error.message);
    const { data } = await sb.from("event_purchases").select("*").eq("id", id).single();
    return data ? toPurchase(data) : null;
  },

  async refundPurchase(id, patch) {
    const sb = createAdminClient();
    const { error } = await sb.from("event_purchases").update({
      payment_status: "refunded",
      refunded_at: patch.refundedAt,
      refunded_by: patch.refundedBy,
      refund_reason: patch.refundReason,
    } as never).eq("id", id);
    if (error) throw new Error(error.message);
    const { data } = await sb.from("event_purchases").select("*").eq("id", id).single();
    return data ? toPurchase(data) : null;
  },

  async updatePurchaseTestFields(id, patch) {
    const sb = createAdminClient();
    const fields: Record<string, unknown> = {};
    if (patch.notes !== undefined) fields.notes = patch.notes;
    if (patch.paymentReference !== undefined) fields.payment_reference = patch.paymentReference;
    if (patch.refundReason !== undefined) fields.refund_reason = patch.refundReason;
    if (Object.keys(fields).length === 0) {
      const { data } = await sb.from("event_purchases").select("*").eq("id", id).maybeSingle();
      return data ? toPurchase(data) : null;
    }
    const { error } = await sb.from("event_purchases").update(fields as never).eq("id", id);
    if (error) throw new Error(error.message);
    const { data } = await sb.from("event_purchases").select("*").eq("id", id).maybeSingle();
    return data ? toPurchase(data) : null;
  },

  async deletePurchase(id) {
    const sb = createAdminClient();
    const { error } = await sb.from("event_purchases").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return true;
  },

  async updatePurchaseEmailTracking(id, patch) {
    const sb = createAdminClient();
    await sb.from("event_purchases").update({
      last_email_type: patch.lastEmailType,
      last_email_sent_at: patch.lastEmailSentAt,
      last_email_success: patch.lastEmailSuccess,
    } as never).eq("id", id);
  },
};
