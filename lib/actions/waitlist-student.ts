"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getStudentRepo } from "@/lib/repositories";
import { isRealUser } from "@/lib/utils/is-real-user";
import { deleteWaitlistFromDB } from "@/lib/supabase/operational-persistence";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";

export async function studentLeaveWaitlistAction(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  if (!waitlistId) return { success: false, error: "Missing waitlist ID" };

  const user = await getAuthUser();
  await ensureOperationalDataHydrated();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated as a student." };
  }

  const student = await getStudentRepo().getById(user.id);
  if (!student) {
    return { success: false, error: "Student profile not found." };
  }

  const svc = getBookingService();
  const entry = svc.waitlist.find((w) => w.id === waitlistId && w.status === "waiting");
  if (!entry) {
    return { success: false, error: "Waitlist entry not found." };
  }

  if (entry.studentId !== student.id) {
    return { success: false, error: "This waitlist entry does not belong to you." };
  }

  const removed = svc.removeFromWaitlist(waitlistId);
  if (!removed) {
    return { success: false, error: "Failed to leave waitlist." };
  }

  if (isRealUser(user.id)) {
    await deleteWaitlistFromDB(waitlistId);
  }

  revalidatePath("/bookings");
  revalidatePath("/classes");
  revalidatePath("/dashboard");

  return { success: true };
}
