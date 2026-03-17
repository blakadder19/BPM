import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import {
  StudentDashboard,
  type StudentBookingSummary,
  type StudentPenaltySummary,
} from "@/components/dashboard/student-dashboard";

const MOCK_TODAY = "2026-03-17";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  if (user.role === "student") {
    const bookingSvc = getBookingService();
    const penaltySvc = getPenaltyService();

    const upcomingBookings: StudentBookingSummary[] = bookingSvc.bookings
      .filter(
        (b) =>
          b.studentName === user.fullName &&
          (b.status === "confirmed" || b.status === "checked_in")
      )
      .map((b) => {
        const cls = bookingSvc.getClass(b.bookableClassId);
        return {
          id: b.id,
          classTitle: cls?.title ?? "Unknown",
          date: cls?.date ?? "",
          startTime: cls?.startTime ?? "",
          endTime: cls?.endTime ?? "",
          location: cls?.location ?? "",
          danceRole: b.danceRole,
          status: b.status,
        };
      })
      .filter((b) => b.date >= MOCK_TODAY)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      );

    const penalties: StudentPenaltySummary[] = penaltySvc.penalties
      .filter((p) => p.studentName === user.fullName)
      .map((p) => ({
        id: p.id,
        classTitle: p.classTitle,
        date: p.classDate,
        reason: p.reason,
        amountCents: p.amountCents,
        resolution: p.resolution,
      }));

    return (
      <StudentDashboard
        fullName={user.fullName}
        upcomingBookings={upcomingBookings}
        penalties={penalties}
      />
    );
  }

  return <AdminDashboard />;
}
