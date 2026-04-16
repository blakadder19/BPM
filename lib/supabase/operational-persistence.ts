/**
 * Supabase CRUD for operational tables (op_bookings, op_waitlist, op_attendance,
 * op_penalties, op_subscriptions).
 * Uses an untyped admin client since these tables are not in the generated Database type.
 */

import { createClient } from "@supabase/supabase-js";
import type { StoredBooking, StoredWaitlistEntry } from "@/lib/services/booking-service";
import type { StoredAttendance } from "@/lib/services/attendance-service";
import type { StoredPenalty } from "@/lib/services/penalty-service";
import type { MockSubscription } from "@/lib/mock-data";
import type { BookingStatus, BookingSource, DanceRole, WaitlistStatus, AttendanceMark, CheckInMethod, PenaltyReason, PenaltyResolution, ProductType, SubscriptionStatus, PaymentMethod, SalePaymentStatus } from "@/types/domain";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cachedClient: any = null;

function getClient() {
  if (_cachedClient) return _cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _cachedClient;
}

// ── Bookings ───────────────────────────────────────────────

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function rowToBooking(r: Record<string, unknown>): StoredBooking {
  return {
    id: str(r.id),
    bookableClassId: str(r.bookable_class_id),
    studentId: str(r.student_id),
    studentName: str(r.student_name),
    danceRole: (r.dance_role as DanceRole) ?? null,
    status: (r.status as BookingStatus) ?? "confirmed",
    source: (r.source as BookingSource) ?? "subscription",
    subscriptionId: (r.subscription_id as string) ?? null,
    subscriptionName: (r.subscription_name as string) ?? null,
    adminNote: (r.admin_note as string) ?? null,
    bookedAt: str(r.booked_at, new Date().toISOString()),
    cancelledAt: (r.cancelled_at as string) ?? null,
    checkInToken: (r.check_in_token as string) ?? null,
  };
}

function bookingToRow(b: StoredBooking) {
  return {
    id: b.id,
    bookable_class_id: b.bookableClassId,
    student_id: b.studentId,
    student_name: b.studentName,
    dance_role: b.danceRole,
    status: b.status,
    source: b.source,
    subscription_id: b.subscriptionId,
    subscription_name: b.subscriptionName,
    admin_note: b.adminNote,
    booked_at: b.bookedAt,
    cancelled_at: b.cancelledAt,
    check_in_token: b.checkInToken,
  };
}

export async function loadBookingsFromDB(): Promise<StoredBooking[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from("op_bookings").select("*");
    if (error) { console.warn("[op-persistence] loadBookings:", error.message); return []; }
    return (data ?? []).map(rowToBooking);
  } catch (e) {
    console.warn("[op-persistence] loadBookings error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function saveBookingToDB(b: StoredBooking): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_bookings").upsert(bookingToRow(b), { onConflict: "id" });
    if (error) console.warn("[op-persistence] saveBooking:", error.message);
  } catch (e) {
    console.warn("[op-persistence] saveBooking error:", e instanceof Error ? e.message : e);
  }
}

export async function deleteBookingFromDB(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_bookings").delete().eq("id", id);
    if (error) console.warn("[op-persistence] deleteBooking:", error.message);
  } catch (e) {
    console.warn("[op-persistence] deleteBooking error:", e instanceof Error ? e.message : e);
  }
}

// ── Waitlist ───────────────────────────────────────────────

function rowToWaitlist(r: Record<string, unknown>): StoredWaitlistEntry {
  return {
    id: str(r.id),
    bookableClassId: str(r.bookable_class_id),
    studentId: str(r.student_id),
    studentName: str(r.student_name),
    danceRole: (r.dance_role as DanceRole) ?? null,
    status: (r.status as WaitlistStatus) ?? "waiting",
    position: (r.position as number) ?? 0,
    joinedAt: str(r.joined_at, new Date().toISOString()),
    promotedAt: (r.promoted_at as string) ?? null,
    subscriptionId: (r.subscription_id as string) ?? null,
    subscriptionName: (r.subscription_name as string) ?? null,
  };
}

function waitlistToRow(w: StoredWaitlistEntry) {
  return {
    id: w.id,
    bookable_class_id: w.bookableClassId,
    student_id: w.studentId,
    student_name: w.studentName,
    dance_role: w.danceRole,
    status: w.status,
    position: w.position,
    joined_at: w.joinedAt,
    promoted_at: w.promotedAt,
    subscription_id: w.subscriptionId,
    subscription_name: w.subscriptionName,
  };
}

export async function loadWaitlistFromDB(): Promise<StoredWaitlistEntry[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("op_waitlist")
      .select("*")
      .eq("status", "waiting");
    if (error) { console.warn("[op-persistence] loadWaitlist:", error.message); return []; }
    return (data ?? []).map(rowToWaitlist);
  } catch (e) {
    console.warn("[op-persistence] loadWaitlist error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function saveWaitlistToDB(w: StoredWaitlistEntry): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_waitlist").upsert(waitlistToRow(w), { onConflict: "id" });
    if (error) console.warn("[op-persistence] saveWaitlist:", error.message);
  } catch (e) {
    console.warn("[op-persistence] saveWaitlist error:", e instanceof Error ? e.message : e);
  }
}

export async function deleteWaitlistFromDB(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_waitlist").delete().eq("id", id);
    if (error) console.warn("[op-persistence] deleteWaitlist:", error.message);
  } catch (e) {
    console.warn("[op-persistence] deleteWaitlist error:", e instanceof Error ? e.message : e);
  }
}

// ── Attendance ─────────────────────────────────────────────

function rowToAttendance(r: Record<string, unknown>): StoredAttendance {
  return {
    id: str(r.id),
    bookableClassId: str(r.bookable_class_id),
    studentId: str(r.student_id),
    studentName: str(r.student_name),
    bookingId: (r.booking_id as string) ?? null,
    classTitle: str(r.class_title),
    date: str(r.date),
    status: (r.status as AttendanceMark) ?? "present",
    checkInMethod: (r.check_in_method as CheckInMethod) ?? "manual",
    markedBy: str(r.marked_by),
    markedAt: str(r.marked_at, new Date().toISOString()),
    notes: (r.notes as string) ?? null,
    source: (r.source as StoredAttendance["source"]) ?? "walk_in",
    subscriptionId: (r.subscription_id as string) ?? null,
  };
}

function attendanceToRow(a: StoredAttendance) {
  return {
    id: a.id,
    bookable_class_id: a.bookableClassId,
    student_id: a.studentId,
    student_name: a.studentName,
    booking_id: a.bookingId,
    class_title: a.classTitle,
    date: a.date,
    status: a.status,
    check_in_method: a.checkInMethod,
    marked_by: a.markedBy,
    marked_at: a.markedAt,
    notes: a.notes,
    source: a.source,
    subscription_id: a.subscriptionId,
  };
}

export async function loadAttendanceFromDB(): Promise<StoredAttendance[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from("op_attendance").select("*");
    if (error) { console.warn("[op-persistence] loadAttendance:", error.message); return []; }
    return (data ?? []).map(rowToAttendance);
  } catch (e) {
    console.warn("[op-persistence] loadAttendance error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function saveAttendanceToDB(a: StoredAttendance): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_attendance").upsert(attendanceToRow(a), { onConflict: "id" });
    if (error) console.warn("[op-persistence] saveAttendance:", error.message);
  } catch (e) {
    console.warn("[op-persistence] saveAttendance error:", e instanceof Error ? e.message : e);
  }
}

export async function deleteAttendanceFromDB(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_attendance").delete().eq("id", id);
    if (error) console.warn("[op-persistence] deleteAttendance:", error.message);
  } catch (e) {
    console.warn("[op-persistence] deleteAttendance error:", e instanceof Error ? e.message : e);
  }
}

// ── Penalties ──────────────────────────────────────────────

function rowToPenalty(r: Record<string, unknown>): StoredPenalty {
  return {
    id: str(r.id),
    studentId: str(r.student_id),
    studentName: str(r.student_name),
    bookingId: (r.booking_id as string) ?? null,
    bookableClassId: str(r.bookable_class_id),
    classTitle: str(r.class_title),
    classDate: str(r.class_date),
    reason: (r.reason as PenaltyReason) ?? "no_show",
    amountCents: (r.amount_cents as number) ?? 0,
    resolution: (r.resolution as PenaltyResolution) ?? "monetary_pending",
    subscriptionId: (r.subscription_id as string) ?? null,
    creditDeducted: (r.credit_deducted as number) ?? 0,
    notes: (r.notes as string) ?? null,
    createdAt: str(r.created_at, new Date().toISOString()),
  };
}

function penaltyToRow(p: StoredPenalty) {
  return {
    id: p.id,
    student_id: p.studentId,
    student_name: p.studentName,
    booking_id: p.bookingId,
    bookable_class_id: p.bookableClassId,
    class_title: p.classTitle,
    class_date: p.classDate,
    reason: p.reason,
    amount_cents: p.amountCents,
    resolution: p.resolution,
    subscription_id: p.subscriptionId,
    credit_deducted: p.creditDeducted,
    notes: p.notes,
    created_at: p.createdAt,
  };
}

export async function loadPenaltiesFromDB(): Promise<StoredPenalty[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from("op_penalties").select("*");
    if (error) { console.warn("[op-persistence] loadPenalties:", error.message); return []; }
    return (data ?? []).map(rowToPenalty);
  } catch (e) {
    console.warn("[op-persistence] loadPenalties error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function savePenaltyToDB(p: StoredPenalty): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_penalties").upsert(penaltyToRow(p), { onConflict: "id" });
    if (error) console.warn("[op-persistence] savePenalty:", error.message);
  } catch (e) {
    console.warn("[op-persistence] savePenalty error:", e instanceof Error ? e.message : e);
  }
}

export async function updatePenaltyInDB(id: string, patch: Partial<Record<string, unknown>>): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_penalties").update(patch).eq("id", id);
    if (error) console.warn("[op-persistence] updatePenalty:", error.message);
  } catch (e) {
    console.warn("[op-persistence] updatePenalty error:", e instanceof Error ? e.message : e);
  }
}

export async function deletePenaltyFromDB(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_penalties").delete().eq("id", id);
    if (error) console.warn("[op-persistence] deletePenalty:", error.message);
  } catch (e) {
    console.warn("[op-persistence] deletePenalty error:", e instanceof Error ? e.message : e);
  }
}

// ── Subscriptions ──────────────────────────────────────────

function rowToSubscription(r: Record<string, unknown>): MockSubscription {
  return {
    id: str(r.id),
    studentId: str(r.student_id),
    productId: str(r.product_id),
    productName: str(r.product_name),
    productType: (r.product_type as ProductType) ?? "membership",
    status: (r.status as SubscriptionStatus) ?? "active",
    totalCredits: (r.total_credits as number) ?? null,
    remainingCredits: (r.remaining_credits as number) ?? null,
    validFrom: str(r.valid_from, new Date().toISOString().slice(0, 10)),
    validUntil: (r.valid_until as string) ?? null,
    selectedStyleId: (r.selected_style_id as string) ?? null,
    selectedStyleName: (r.selected_style_name as string) ?? null,
    selectedStyleIds: r.selected_style_ids ? JSON.parse(str(r.selected_style_ids, "null")) : null,
    selectedStyleNames: r.selected_style_names ? JSON.parse(str(r.selected_style_names, "null")) : null,
    notes: (r.notes as string) ?? null,
    termId: (r.term_id as string) ?? null,
    paymentMethod: (r.payment_method as PaymentMethod) ?? "cash",
    paymentStatus: (r.payment_status as SalePaymentStatus) ?? "paid",
    assignedBy: (r.assigned_by as string) ?? null,
    assignedAt: str(r.assigned_at) || new Date().toISOString(),
    autoRenew: (r.auto_renew as boolean) ?? false,
    classesUsed: (r.classes_used as number) ?? 0,
    classesPerTerm: (r.classes_per_term as number) ?? null,
    renewedFromId: (r.renewed_from_id as string) ?? null,
    paidAt: (r.paid_at as string) ?? null,
    paymentReference: (r.payment_reference as string) ?? null,
    paymentNotes: (r.payment_notes as string) ?? null,
    collectedBy: (r.collected_by as string) ?? null,
    priceCentsAtPurchase: r.price_cents_at_purchase != null ? Number(r.price_cents_at_purchase) : null,
    currencyAtPurchase: (r.currency_at_purchase as string) ?? "EUR",
    refundedAt: (r.refunded_at as string) ?? null,
    refundedBy: (r.refunded_by as string) ?? null,
    refundReason: (r.refund_reason as string) ?? null,
  };
}

function subscriptionToRow(s: MockSubscription) {
  return {
    id: s.id,
    student_id: s.studentId,
    product_id: s.productId,
    product_name: s.productName,
    product_type: s.productType,
    status: s.status,
    total_credits: s.totalCredits,
    remaining_credits: s.remainingCredits,
    valid_from: s.validFrom,
    valid_until: s.validUntil,
    selected_style_id: s.selectedStyleId,
    selected_style_name: s.selectedStyleName,
    selected_style_ids: s.selectedStyleIds ? JSON.stringify(s.selectedStyleIds) : null,
    selected_style_names: s.selectedStyleNames ? JSON.stringify(s.selectedStyleNames) : null,
    notes: s.notes,
    term_id: s.termId,
    payment_method: s.paymentMethod,
    payment_status: s.paymentStatus,
    assigned_by: s.assignedBy,
    assigned_at: s.assignedAt,
    auto_renew: s.autoRenew,
    classes_used: s.classesUsed,
    classes_per_term: s.classesPerTerm,
    renewed_from_id: s.renewedFromId,
    paid_at: s.paidAt,
    payment_reference: s.paymentReference,
    payment_notes: s.paymentNotes,
    collected_by: s.collectedBy,
    price_cents_at_purchase: s.priceCentsAtPurchase,
    currency_at_purchase: s.currencyAtPurchase,
    refunded_at: s.refundedAt,
    refunded_by: s.refundedBy,
    refund_reason: s.refundReason,
  };
}

export async function loadSubscriptionsFromDB(): Promise<MockSubscription[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from("op_subscriptions").select("*");
    if (error) { console.warn("[op-persistence] loadSubscriptions:", error.message); return []; }
    return (data ?? []).map(rowToSubscription);
  } catch (e) {
    console.warn("[op-persistence] loadSubscriptions error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function saveSubscriptionToDB(s: MockSubscription): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_subscriptions").upsert(subscriptionToRow(s), { onConflict: "id" });
    if (error) console.warn("[op-persistence] saveSubscription:", error.message);
  } catch (e) {
    console.warn("[op-persistence] saveSubscription error:", e instanceof Error ? e.message : e);
  }
}

// ── Studio Hire ──────────────────────────────────────────────

import type { StoredStudioHire } from "@/lib/services/studio-hire-service";

function rowToStudioHire(r: Record<string, unknown>): StoredStudioHire {
  return {
    id: str(r.id),
    requesterName: str(r.requester_name),
    contactEmail: (r.contact_email as string) ?? null,
    contactPhone: (r.contact_phone as string) ?? null,
    date: str(r.date),
    startTime: str(r.start_time),
    endTime: str(r.end_time),
    expectedAttendees: r.expected_attendees != null ? Number(r.expected_attendees) : null,
    bookingType: r.booking_type as StoredStudioHire["bookingType"],
    isBlockBooking: !!r.is_block_booking,
    blockDetails: (r.block_details as string) ?? null,
    status: r.status as StoredStudioHire["status"],
    depositRequiredCents: r.deposit_required_cents != null ? Number(r.deposit_required_cents) : null,
    depositPaidCents: r.deposit_paid_cents != null ? Number(r.deposit_paid_cents) : null,
    cancellationOutcome: (r.cancellation_outcome as StoredStudioHire["cancellationOutcome"]) ?? null,
    refundedCents: r.refunded_cents != null ? Number(r.refunded_cents) : null,
    cancelledAt: (r.cancelled_at as string) ?? null,
    cancellationNote: (r.cancellation_note as string) ?? null,
    adminNote: (r.admin_note as string) ?? null,
    createdAt: str(r.created_at, new Date().toISOString()),
    updatedAt: str(r.updated_at, new Date().toISOString()),
  };
}

function studioHireToRow(e: StoredStudioHire): Record<string, unknown> {
  return {
    id: e.id,
    requester_name: e.requesterName,
    contact_email: e.contactEmail,
    contact_phone: e.contactPhone,
    date: e.date,
    start_time: e.startTime,
    end_time: e.endTime,
    expected_attendees: e.expectedAttendees,
    booking_type: e.bookingType,
    is_block_booking: e.isBlockBooking,
    block_details: e.blockDetails,
    status: e.status,
    deposit_required_cents: e.depositRequiredCents,
    deposit_paid_cents: e.depositPaidCents,
    cancellation_outcome: e.cancellationOutcome,
    refunded_cents: e.refundedCents,
    cancelled_at: e.cancelledAt,
    cancellation_note: e.cancellationNote,
    admin_note: e.adminNote,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export async function loadStudioHiresFromDB(): Promise<StoredStudioHire[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from("op_studio_hires").select("*");
    if (error) { console.warn("[op-persistence] loadStudioHires:", error.message); return []; }
    return (data ?? []).map(rowToStudioHire);
  } catch (e) {
    console.warn("[op-persistence] loadStudioHires error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function saveStudioHireToDB(entry: StoredStudioHire): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_studio_hires").upsert(studioHireToRow(entry), { onConflict: "id" });
    if (error) console.warn("[op-persistence] saveStudioHire:", error.message);
  } catch (e) {
    console.warn("[op-persistence] saveStudioHire error:", e instanceof Error ? e.message : e);
  }
}

export async function deleteStudioHireFromDB(id: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_studio_hires").delete().eq("id", id);
    if (error) console.warn("[op-persistence] deleteStudioHire:", error.message);
  } catch (e) {
    console.warn("[op-persistence] deleteStudioHire error:", e instanceof Error ? e.message : e);
  }
}

// ── Finance Audit Log ──────────────────────────────────────

import type { FinanceAuditEntry } from "@/lib/services/finance-audit-log";

function rowToAuditEntry(r: Record<string, unknown>): FinanceAuditEntry {
  return {
    id: str(r.id),
    entityType: str(r.entity_type) as FinanceAuditEntry["entityType"],
    entityId: str(r.entity_id),
    action: str(r.action) as FinanceAuditEntry["action"],
    performedBy: (r.performed_by as string) ?? null,
    detail: (r.detail as string) ?? null,
    previousValue: (r.previous_value as string) ?? null,
    newValue: (r.new_value as string) ?? null,
    createdAt: str(r.created_at, new Date().toISOString()),
  };
}

function auditEntryToRow(e: FinanceAuditEntry) {
  return {
    id: e.id,
    entity_type: e.entityType,
    entity_id: e.entityId,
    action: e.action,
    performed_by: e.performedBy,
    detail: e.detail,
    previous_value: e.previousValue,
    new_value: e.newValue,
    created_at: e.createdAt,
  };
}

export async function loadAuditLogFromDB(): Promise<FinanceAuditEntry[]> {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("op_finance_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) { console.warn("[op-persistence] loadAuditLog:", error.message); return []; }
    return (data ?? []).map(rowToAuditEntry);
  } catch (e) {
    console.warn("[op-persistence] loadAuditLog error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function saveAuditEntryToDB(entry: FinanceAuditEntry): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client
      .from("op_finance_audit_log")
      .insert(auditEntryToRow(entry));
    if (error) console.warn("[op-persistence] saveAuditEntry:", error.message);
  } catch (e) {
    console.warn("[op-persistence] saveAuditEntry error:", e instanceof Error ? e.message : e);
  }
}
