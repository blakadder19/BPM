"use server";

import { studentBookingSchema } from "@/types/schemas";
import { getBookingService } from "@/lib/services/booking-store";
import type { DanceRole } from "@/types/domain";

export interface BookingResult {
  success: boolean;
  bookingId?: string;
  waitlistId?: string;
  waitlistPosition?: number;
  className?: string;
  date?: string;
  status?: "confirmed" | "waitlisted";
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createStudentBooking(
  _prev: BookingResult | null,
  formData: FormData
): Promise<BookingResult> {
  await new Promise((r) => setTimeout(r, 300));

  const raw = {
    bookableClassId: formData.get("bookableClassId") as string,
    fullName: formData.get("fullName") as string,
    email: formData.get("email") as string,
    phone: formData.get("phone") as string,
    danceRole: (formData.get("danceRole") as string) || null,
    notes: (formData.get("notes") as string) || undefined,
  };

  const parsed = studentBookingSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString();
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, fieldErrors, error: "Please fix the errors below." };
  }

  const { bookableClassId, fullName, danceRole } = parsed.data;

  const service = getBookingService();
  const cls = service.getClass(bookableClassId);

  if (cls?.danceStyleRequiresBalance && !danceRole) {
    return {
      success: false,
      fieldErrors: { danceRole: "Please select your dance role for this class." },
    };
  }

  const outcome = service.bookClass({
    bookableClassId,
    studentId: `student-${fullName.toLowerCase().replace(/\s+/g, "-")}`,
    studentName: fullName,
    danceRole: (danceRole as DanceRole) ?? null,
  });

  switch (outcome.type) {
    case "confirmed":
      return {
        success: true,
        bookingId: outcome.bookingId,
        className: outcome.className,
        date: outcome.date,
        status: "confirmed",
      };

    case "waitlisted":
      return {
        success: true,
        waitlistId: outcome.waitlistId,
        waitlistPosition: outcome.position,
        className: outcome.className,
        date: outcome.date,
        status: "waitlisted",
      };

    case "rejected":
      return { success: false, error: outcome.reason };
  }
}
