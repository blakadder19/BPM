"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { STUDENTS } from "@/lib/mock-data";

export async function studentLeaveWaitlistAction(
  waitlistId: string
): Promise<{ success: boolean; error?: string }> {
  if (!waitlistId) return { success: false, error: "Missing waitlist ID" };

  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated as a student." };
  }

  const student = STUDENTS.find(
    (s) => s.fullName === user.fullName || s.email === user.email
  );
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

  revalidatePath("/bookings");
  revalidatePath("/classes");
  revalidatePath("/dashboard");

  return { success: true };
}
