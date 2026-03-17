import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { StudentBookings } from "@/components/booking/student-bookings";
import { AdminBookings } from "@/components/booking/admin-bookings";

export interface BookingView {
  id: string;
  studentName: string;
  classTitle: string;
  date: string;
  startTime: string;
  danceRole: string | null;
  status: string;
  bookedAt: string;
}

export default async function BookingsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const svc = getBookingService();

  const enrich = (b: (typeof svc.bookings)[number]): BookingView => {
    const cls = svc.getClass(b.bookableClassId);
    return {
      id: b.id,
      studentName: b.studentName,
      classTitle: cls?.title ?? "Unknown",
      date: cls?.date ?? "",
      startTime: cls?.startTime ?? "",
      danceRole: b.danceRole,
      status: b.status,
      bookedAt: b.bookedAt,
    };
  };

  if (user.role === "student") {
    const mine = svc.bookings
      .filter((b) => b.studentName === user.fullName)
      .map(enrich);
    return <StudentBookings bookings={mine} />;
  }

  const all = svc.bookings.map(enrich);
  return <AdminBookings bookings={all} />;
}
