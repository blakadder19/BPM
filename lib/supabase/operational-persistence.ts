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

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// ── Bookings ───────────────────────────────────────────────

function rowToBooking(r: Record<string, unknown>): StoredBooking {
  return {
    id: r.id as string,
    bookableClassId: r.bookable_class_id as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    danceRole: (r.dance_role as DanceRole) ?? null,
    status: r.status as BookingStatus,
    source: (r.source as BookingSource) ?? "subscription",
    subscriptionId: (r.subscription_id as string) ?? null,
    subscriptionName: (r.subscription_name as string) ?? null,
    adminNote: (r.admin_note as string) ?? null,
    bookedAt: r.booked_at as string,
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

export async function updateBookingInDB(id: string, patch: Partial<Record<string, unknown>>): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from("op_bookings").update(patch).eq("id", id);
    if (error) console.warn("[op-persistence] updateBooking:", error.message);
  } catch (e) {
    console.warn("[op-persistence] updateBooking error:", e instanceof Error ? e.message : e);
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
    id: r.id as string,
    bookableClassId: r.bookable_class_id as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    danceRole: (r.dance_role as DanceRole) ?? null,
    status: r.status as WaitlistStatus,
    position: r.position as number,
    joinedAt: r.joined_at as string,
    promotedAt: (r.promoted_at as string) ?? null,
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
    id: r.id as string,
    bookableClassId: r.bookable_class_id as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    bookingId: (r.booking_id as string) ?? null,
    classTitle: r.class_title as string,
    date: r.date as string,
    status: r.status as AttendanceMark,
    checkInMethod: (r.check_in_method as CheckInMethod) ?? "manual",
    markedBy: r.marked_by as string,
    markedAt: r.marked_at as string,
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
    id: r.id as string,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    bookingId: (r.booking_id as string) ?? null,
    bookableClassId: r.bookable_class_id as string,
    classTitle: r.class_title as string,
    classDate: r.class_date as string,
    reason: r.reason as PenaltyReason,
    amountCents: r.amount_cents as number,
    resolution: r.resolution as PenaltyResolution,
    subscriptionId: (r.subscription_id as string) ?? null,
    creditDeducted: (r.credit_deducted as number) ?? 0,
    notes: (r.notes as string) ?? null,
    createdAt: r.created_at as string,
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
    id: r.id as string,
    studentId: r.student_id as string,
    productId: r.product_id as string,
    productName: r.product_name as string,
    productType: r.product_type as ProductType,
    status: r.status as SubscriptionStatus,
    totalCredits: (r.total_credits as number) ?? null,
    remainingCredits: (r.remaining_credits as number) ?? null,
    validFrom: r.valid_from as string,
    validUntil: (r.valid_until as string) ?? null,
    selectedStyleId: (r.selected_style_id as string) ?? null,
    selectedStyleName: (r.selected_style_name as string) ?? null,
    selectedStyleIds: r.selected_style_ids ? JSON.parse(r.selected_style_ids as string) : null,
    selectedStyleNames: r.selected_style_names ? JSON.parse(r.selected_style_names as string) : null,
    notes: (r.notes as string) ?? null,
    termId: (r.term_id as string) ?? null,
    paymentMethod: (r.payment_method as PaymentMethod) ?? "cash",
    paymentStatus: (r.payment_status as SalePaymentStatus) ?? "paid",
    assignedBy: (r.assigned_by as string) ?? null,
    assignedAt: (r.assigned_at as string) ?? new Date().toISOString(),
    autoRenew: (r.auto_renew as boolean) ?? false,
    classesUsed: (r.classes_used as number) ?? 0,
    classesPerTerm: (r.classes_per_term as number) ?? null,
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
