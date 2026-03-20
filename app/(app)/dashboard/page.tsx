import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getStudentRepo,
  getSubscriptionRepo,
  getProductRepo,
  getTermRepo,
  getCocRepo,
  getBookingRepo,
  getPenaltyRepo,
  getAttendanceRepo,
} from "@/lib/repositories";
import { getCurrentTerm, getTermWeekNumber } from "@/lib/domain/term-rules";
import { getTodayStr, isClassInFuture } from "@/lib/domain/datetime";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { computeMemberBenefits } from "@/lib/domain/member-benefits";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
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

  await ensureOperationalDataHydrated();

  runAttendanceClosure();

  if (user.role === "student") {
    const isRealUser = !user.id.startsWith("dev-");
    if (isRealUser) {
      const cocDone = await getCocRepo().hasAcceptedVersion(
        user.id,
        CURRENT_CODE_OF_CONDUCT.version
      );
      if (!cocDone) redirect("/onboarding");
    }

    const bookingSvc = getBookingRepo().getService();
    const penaltySvc = getPenaltyRepo().getService();

    const student = await getStudentRepo().getById(user.id);

    const attendanceSvc = getAttendanceRepo().getService();

    const upcomingBookings: StudentBookingSummary[] = bookingSvc.bookings
      .filter(
        (b) =>
          b.studentId === user.id &&
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
      .filter((p) => p.studentId === user.id && p.resolution !== "attendance_corrected")
      .map((p) => ({
        id: p.id,
        classTitle: p.classTitle,
        date: p.classDate,
        reason: p.reason,
        amountCents: p.amountCents,
        resolution: p.resolution,
      }));

    const terms = await getTermRepo().getAll();
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

    const allSubs = student
      ? await getSubscriptionRepo().getByStudent(student.id)
      : [];
    const studentSubs = allSubs.filter((s) => s.status === "active");

    const entitlements: StudentEntitlementSummary[] = await Promise.all(
      studentSubs.map(async (sub) => {
        const product = await getProductRepo().getById(sub.productId);
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
      })
    );

    const waitlistedCount = student
      ? bookingSvc.getWaitlistForStudent(student.id).length
      : 0;

    const cocAccepted = await getCocRepo().hasAcceptedVersion(
      user.id,
      CURRENT_CODE_OF_CONDUCT.version
    );

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

  return <AdminDashboard todayStr={getTodayStr()} />;
}
