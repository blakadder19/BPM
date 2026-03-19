import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getSubscriptions } from "@/lib/services/subscription-store";
import { getProduct } from "@/lib/services/product-store";
import { getTerms } from "@/lib/services/term-store";
import { getCurrentTerm, getTermWeekNumber } from "@/lib/domain/term-rules";
import { getTodayStr, isClassInFuture } from "@/lib/domain/datetime";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import { getAttendanceService } from "@/lib/services/attendance-store";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { computeMemberBenefits } from "@/lib/domain/member-benefits";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import { STUDENTS } from "@/lib/mock-data";
import { hasAcceptedCurrentVersion } from "@/lib/services/coc-store";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
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

  runAttendanceClosure();

  if (user.role === "student") {
    const bookingSvc = getBookingService();
    const penaltySvc = getPenaltyService();

    const student = STUDENTS.find(
      (s) => s.fullName === user.fullName || s.email === user.email
    );

    const attendanceSvc = getAttendanceService();

    const upcomingBookings: StudentBookingSummary[] = bookingSvc.bookings
      .filter(
        (b) =>
          b.studentName === user.fullName &&
          (b.status === "confirmed" || b.status === "checked_in")
      )
      .map((b) => {
        const cls = bookingSvc.getClass(b.bookableClassId);
        const attRecord = attendanceSvc.getRecord(b.bookableClassId, b.studentId);
        return {
          id: b.id,
          classTitle: cls?.title ?? "Unknown",
          date: cls?.date ?? "",
          startTime: cls?.startTime ?? "",
          endTime: cls?.endTime ?? "",
          location: cls?.location ?? "",
          danceRole: b.danceRole,
          status: resolveStudentVisibleStatus(b.status, attRecord?.status),
        };
      })
      .filter((b) => isClassInFuture(b.date, b.startTime))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      );

    const penalties: StudentPenaltySummary[] = penaltySvc.penalties
      .filter((p) => p.studentName === user.fullName && p.resolution !== "attendance_corrected")
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

    const entitlements: StudentEntitlementSummary[] = studentSubs.map((sub) => {
      const product = getProduct(sub.productId);
      return {
        id: sub.id,
        productName: sub.productName,
        productType: sub.productType,
        description: product?.description ?? null,
        classesUsed: sub.classesUsed,
        classesPerTerm: sub.classesPerTerm,
        remainingCredits: sub.remainingCredits,
        totalCredits: sub.totalCredits,
        autoRenew: sub.autoRenew,
        termName: currentTerm?.name ?? null,
        selectedStyleName: sub.selectedStyleName ?? sub.selectedStyleNames?.join(", ") ?? null,
      };
    });

    const waitlistedCount = student
      ? bookingSvc.getWaitlistForStudent(student.id).length
      : 0;

    const cocAccepted = student
      ? hasAcceptedCurrentVersion(student.id, CURRENT_CODE_OF_CONDUCT.version)
      : false;

    const benefits = student
      ? computeMemberBenefits({
          dateOfBirth: student.dateOfBirth,
          referenceDate: todayStr,
          subscriptions: studentSubs,
          birthdayClassUsed: isBirthdayClassUsed(student.id, new Date().getFullYear()),
        })
      : null;

    return (
      <StudentDashboard
        fullName={user.fullName}
        upcomingBookings={upcomingBookings}
        penalties={penalties}
        termInfo={termInfo}
        entitlements={entitlements}
        waitlistedCount={waitlistedCount}
        codeOfConductAccepted={cocAccepted}
        benefits={benefits}
      />
    );
  }

  return <AdminDashboard />;
}
