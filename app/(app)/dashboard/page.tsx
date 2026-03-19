import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSubscriptions } from "@/lib/services/subscription-store";
import { getTerms } from "@/lib/services/term-store";
import { getCurrentTerm, getTermWeekNumber } from "@/lib/domain/term-rules";
import { getTodayStr, isClassInFuture } from "@/lib/domain/datetime";
import { closeAttendanceForPastClasses } from "@/lib/actions/attendance";
import { STUDENTS } from "@/lib/mock-data";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import {
  StudentDashboard,
  type StudentBookingSummary,
  type StudentPenaltySummary,
  type StudentTermInfo,
  type StudentEntitlementSummary,
} from "@/components/dashboard/student-dashboard";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  await closeAttendanceForPastClasses();

  if (user.role === "student") {
    const bookingSvc = getBookingService();
    const penaltySvc = getPenaltyService();

    const student = STUDENTS.find(
      (s) => s.fullName === user.fullName || s.email === user.email
    );

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
      .filter((b) => isClassInFuture(b.date, b.startTime))
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

    const terms = getTerms();
    const todayStr = getTodayStr();
    const currentTerm = getCurrentTerm(terms, todayStr);
    let termInfo: StudentTermInfo | null = null;
    if (currentTerm) {
      termInfo = {
        name: currentTerm.name,
        startDate: currentTerm.startDate,
        endDate: currentTerm.endDate,
        weekNumber: getTermWeekNumber(todayStr, currentTerm),
      };
    }

    const allSubs = getSubscriptions();
    const studentSubs = student
      ? allSubs.filter((s) => s.studentId === student.id && s.status === "active")
      : [];

    const entitlements: StudentEntitlementSummary[] = studentSubs.map((sub) => ({
      id: sub.id,
      productName: sub.productName,
      productType: sub.productType,
      classesUsed: sub.classesUsed,
      classesPerTerm: sub.classesPerTerm,
      remainingCredits: sub.remainingCredits,
      totalCredits: sub.totalCredits,
      autoRenew: sub.autoRenew,
      termName: currentTerm?.name ?? null,
    }));

    const waitlistedCount = student
      ? bookingSvc.getWaitlistForStudent(student.id).length
      : 0;

    return (
      <StudentDashboard
        fullName={user.fullName}
        upcomingBookings={upcomingBookings}
        penalties={penalties}
        termInfo={termInfo}
        entitlements={entitlements}
        waitlistedCount={waitlistedCount}
      />
    );
  }

  return <AdminDashboard />;
}
