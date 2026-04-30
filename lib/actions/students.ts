"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/staff-permissions";
import {
  createStudent,
  updateStudent,
  toggleStudentActive,
  deleteStudent,
} from "@/lib/services/student-service";
import type { DanceRole } from "@/types/domain";

function parseRole(raw: string | null): DanceRole | null {
  return raw === "leader" || raw === "follower" ? raw : null;
}

export async function createStudentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("students:create");
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const preferredRole = parseRole(formData.get("preferredRole") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const emergencyContactName = (formData.get("emergencyContactName") as string)?.trim() || null;
  const emergencyContactPhone = (formData.get("emergencyContactPhone") as string)?.trim() || null;
  const dobMonth = (formData.get("dobMonth") as string)?.trim() || "";
  const dobDay = (formData.get("dobDay") as string)?.trim() || "";
  const dateOfBirth =
    dobMonth && dobDay
      ? `${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`
      : null;

  if (!fullName) return { success: false, error: "Name is required" };
  if (!email || !email.includes("@"))
    return { success: false, error: "A valid email is required" };

  const result = await createStudent({
    fullName,
    email,
    phone,
    preferredRole,
    notes,
    emergencyContactName,
    emergencyContactPhone,
    dateOfBirth,
  });

  if (result.success) revalidatePath("/students");
  return result;
}

export async function updateStudentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("students:edit");
  const id = formData.get("id") as string;
  const fullName = (formData.get("fullName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const preferredRole = parseRole(formData.get("preferredRole") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const emergencyContactName = (formData.get("emergencyContactName") as string)?.trim() || null;
  const emergencyContactPhone = (formData.get("emergencyContactPhone") as string)?.trim() || null;
  const dobMonth = (formData.get("dobMonth") as string)?.trim() || "";
  const dobDay = (formData.get("dobDay") as string)?.trim() || "";
  const dateOfBirth =
    dobMonth && dobDay
      ? `${dobMonth.padStart(2, "0")}-${dobDay.padStart(2, "0")}`
      : null;
  const isActiveRaw = formData.get("isActive") as string;
  const isActive = isActiveRaw === "true";

  if (!id) return { success: false, error: "Missing student ID" };
  if (!fullName) return { success: false, error: "Name is required" };
  if (!email || !email.includes("@"))
    return { success: false, error: "A valid email is required" };

  const result = await updateStudent(id, {
    fullName,
    email,
    phone,
    preferredRole,
    isActive,
    notes,
    emergencyContactName,
    emergencyContactPhone,
    dateOfBirth,
  });

  if (result.success) revalidatePath("/students");
  return result;
}

export async function toggleStudentActiveAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("students:edit");
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing student ID" };

  const result = await toggleStudentActive(id);
  if (result.success) revalidatePath("/students");
  return result;
}

export async function deleteStudentAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("students:delete");
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing student ID" };

  const result = await deleteStudent(id);
  if (result.success) {
    purgeStudentFromMemory(id);
    try {
      const { resetHydrationFlags } = require("@/lib/supabase/hydrate-operational");
      resetHydrationFlags();
    } catch { /* module not available */ }
    revalidatePath("/students");
    revalidatePath("/dashboard");
    revalidatePath("/bookings");
    revalidatePath("/attendance");
    revalidatePath("/penalties");
  }
  return result;
}

export interface RelatedBookingSummary {
  bookingId: string;
  classTitle: string;
  date: string;
  startTime: string;
  status: string;
}

export async function getRelatedBookingsForSubscriptionAction(
  subscriptionId: string,
): Promise<{ bookings: RelatedBookingSummary[] }> {
  await requirePermission("students:edit");
  const { getBookingService } = await import("@/lib/services/booking-store");
  const { ensureOperationalDataHydrated } = await import("@/lib/supabase/hydrate-operational");
  const { getTodayStr } = await import("@/lib/domain/datetime");
  await ensureOperationalDataHydrated();

  const svc = getBookingService();
  const today = getTodayStr();
  const ACTIVE = new Set(["confirmed", "checked_in"]);

  const related = svc.bookings.filter((b) => {
    if (b.subscriptionId !== subscriptionId) return false;
    if (!ACTIVE.has(b.status)) return false;
    const cls = svc.getClass(b.bookableClassId);
    return cls ? cls.date >= today : false;
  });

  return {
    bookings: related.map((b) => {
      const cls = svc.getClass(b.bookableClassId);
      return {
        bookingId: b.id,
        classTitle: cls?.title ?? "Unknown class",
        date: cls?.date ?? "",
        startTime: cls?.startTime ?? "",
        status: b.status,
      };
    }),
  };
}

export async function removeStudentSubscriptionAction(
  subscriptionId: string,
  cancelBookingIds?: string[],
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("students:edit");
  if (!subscriptionId) return { success: false, error: "Missing subscription ID" };

  const { updateSubscription } = await import("@/lib/services/subscription-service");
  const { getSubscriptionRepo } = await import("@/lib/repositories");

  const sub = await getSubscriptionRepo().getById(subscriptionId);
  if (!sub) return { success: false, error: "Subscription not found" };

  if (cancelBookingIds && cancelBookingIds.length > 0) {
    const { getBookingService } = await import("@/lib/services/booking-store");
    const { ensureOperationalDataHydrated } = await import("@/lib/supabase/hydrate-operational");
    const { isRealUser } = await import("@/lib/utils/is-real-user");
    const { saveBookingToDB } = await import("@/lib/supabase/operational-persistence");
    await ensureOperationalDataHydrated();
    const svc = getBookingService();
    for (const bid of cancelBookingIds) {
      svc.cancelBookingAsAdmin(bid, false);
      if (isRealUser(sub.studentId)) {
        const updated = svc.bookings.find((b) => b.id === bid);
        if (updated) await saveBookingToDB(updated);
      }
    }
  }

  const result = await updateSubscription(subscriptionId, {
    status: "cancelled",
    autoRenew: false,
  });

  if (result.success) {
    revalidatePath("/students");
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/bookings");
    revalidatePath("/attendance");
  }
  return result;
}

export async function deleteStudentSubscriptionAction(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  await requirePermission("students:delete");
  if (!subscriptionId) return { success: false, error: "Missing subscription ID" };

  const { getSubscriptionRepo } = await import("@/lib/repositories");
  const sub = await getSubscriptionRepo().getById(subscriptionId);
  if (!sub) return { success: false, error: "Subscription record not found" };

  if (sub.status === "active") {
    return {
      success: false,
      error: "Cannot permanently delete an active subscription. Cancel it first.",
    };
  }

  const { deleteSubscription } = await import("@/lib/services/subscription-service");
  const result = await deleteSubscription(subscriptionId);

  if (result.success) {
    try {
      const { dismissNotificationsForSubscription } = await import("@/lib/communications/notification-store");
      await dismissNotificationsForSubscription(sub.studentId, subscriptionId);
    } catch { /* best-effort */ }
    revalidatePath("/students");
    revalidatePath("/products");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function updateOwnPreferredRoleAction(
  role: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAuth();
  if (user.role !== "student") {
    return { success: false, error: "Only students can update their own role." };
  }
  const preferredRole = parseRole(role || null);
  const result = await updateStudent(user.id, { preferredRole });
  if (result.success) {
    revalidatePath("/dashboard");
    revalidatePath("/classes");
    revalidatePath("/bookings");
  }
  return result;
}

function purgeStudentFromMemory(studentId: string) {
  try {
    const { getBookingService } = require("@/lib/services/booking-store");
    const svc = getBookingService();
    const beforeBookings = svc.bookings.length;
    svc.bookings = svc.bookings.filter((b: { studentId: string }) => b.studentId !== studentId);
    svc.waitlist = svc.waitlist.filter((w: { studentId: string }) => w.studentId !== studentId);
    if (svc.bookings.length !== beforeBookings) {
      // class map is unchanged; bookings were just removed
    }
  } catch { /* store not loaded */ }

  try {
    const { getAttendanceService } = require("@/lib/services/attendance-store");
    const svc = getAttendanceService();
    svc.records = svc.records.filter((r: { studentId: string }) => r.studentId !== studentId);
  } catch { /* store not loaded */ }

  try {
    const { getPenaltyService } = require("@/lib/services/penalty-store");
    const svc = getPenaltyService();
    svc.penalties = svc.penalties.filter((p: { studentId: string }) => p.studentId !== studentId);
  } catch { /* store not loaded */ }

  try {
    const { getSubscriptions } = require("@/lib/services/subscription-store");
    const store = getSubscriptions();
    const idx = store.length;
    for (let i = idx - 1; i >= 0; i--) {
      if (store[i].studentId === studentId) store.splice(i, 1);
    }
  } catch { /* store not loaded */ }
}
