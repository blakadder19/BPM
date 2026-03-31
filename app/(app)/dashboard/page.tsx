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
import { getTodayStr, isClassEnded, effectiveInstanceStatus } from "@/lib/domain/datetime";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { computeMemberBenefits } from "@/lib/domain/member-benefits";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { AdminDashboard, type AdminDashboardData, type DashboardClassSummary, type DashboardDemandItem } from "@/components/dashboard/admin-dashboard";
import { getInstances } from "@/lib/services/schedule-store";
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
        if (!cls) return null;
        const attRecord = attendanceSvc.getRecord(b.bookableClassId, b.studentId);
        return {
          id: b.id,
          classTitle: cls.title,
          date: cls.date,
          startTime: cls.startTime,
          endTime: cls.endTime,
          location: cls.location,
          danceRole: b.danceRole,
          status: resolveStudentVisibleStatus(b.status, attRecord?.status),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null && !isClassEnded(b.date, b.endTime))
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
        const linkedTerm = sub.termId
          ? terms.find((t) => t.id === sub.termId) ?? null
          : null;
        return {
          id: sub.id,
          productName: sub.productName,
          productType: sub.productType,
          description: product?.description ?? null,
          status: sub.status,
          classesUsed: sub.classesUsed,
          classesPerTerm: sub.classesPerTerm,
          remainingCredits: sub.remainingCredits,
          totalCredits: sub.totalCredits,
          autoRenew: sub.autoRenew,
          termName: linkedTerm?.name ?? null,
          selectedStyleName: sub.selectedStyleName ?? sub.selectedStyleNames?.join(", ") ?? null,
          validFrom: sub.validFrom,
          validUntil: sub.validUntil,
          paymentStatus: sub.paymentStatus ?? null,
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

  const todayStr = getTodayStr();

  const allInstances = getInstances();
  const bookingSvc = getBookingRepo().getService();
  const attendanceSvc = getAttendanceRepo().getService();
  const penaltySvc = getPenaltyRepo().getService();

  const upcomingInstances = allInstances
    .filter((bc) =>
      bc.date >= todayStr &&
      bc.classType === "class" &&
      !isClassEnded(bc.date, bc.endTime)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const todaysClassCount = allInstances.filter(
    (bc) => bc.date === todayStr && bc.classType === "class"
  ).length;

  const upcomingBookingCount = bookingSvc.bookings.filter((b) => {
    if (b.status !== "confirmed") return false;
    const cls = bookingSvc.getClass(b.bookableClassId);
    if (!cls || cls.date < todayStr) return false;
    return !isClassEnded(cls.date, cls.endTime);
  }).length;

  const upcomingClassIds = new Set(
    allInstances
      .filter((bc) => bc.date >= todayStr && !isClassEnded(bc.date, bc.endTime))
      .map((bc) => bc.id)
  );
  const activeWaitlistCount = bookingSvc.waitlist.filter(
    (w) => w.status === "waiting" && upcomingClassIds.has(w.bookableClassId)
  ).length;

  const unresolvedPenalties = penaltySvc.penalties.filter(
    (p) => p.resolution === "monetary_pending"
  );

  const toSummary = (bc: typeof allInstances[number]): DashboardClassSummary => ({
    id: bc.id,
    title: bc.title,
    date: bc.date,
    startTime: bc.startTime,
    endTime: bc.endTime,
    location: bc.location,
    status: effectiveInstanceStatus(bc.status, bc.date, bc.startTime, bc.endTime),
    maxCapacity: bc.maxCapacity,
    bookedCount: bc.bookedCount,
    waitlistCount: bc.waitlistCount,
    leaderCap: bc.leaderCap,
    followerCap: bc.followerCap,
    leaderCount: bc.leaderCount,
    followerCount: bc.followerCount,
    styleName: bc.styleName,
  });

  const demandClasses: DashboardDemandItem[] = upcomingInstances
    .filter((bc) => bc.maxCapacity && bc.maxCapacity > 0)
    .map((bc) => ({
      ...toSummary(bc),
      fillRate: bc.bookedCount / bc.maxCapacity!,
    }))
    .sort((a, b) => b.fillRate - a.fillRate)
    .slice(0, 5);

  const partnerClasses = upcomingInstances
    .filter((bc) => bc.leaderCap !== null && bc.followerCap !== null && bc.bookedCount > 0)
    .map(toSummary);

  const attendanceTotals = {
    present: attendanceSvc.records.filter((a) => a.status === "present").length,
    late: attendanceSvc.records.filter((a) => a.status === "late").length,
    absent: attendanceSvc.records.filter((a) => a.status === "absent").length,
    excused: attendanceSvc.records.filter((a) => a.status === "excused").length,
  };
  const attendanceTotal =
    attendanceTotals.present + attendanceTotals.late +
    attendanceTotals.absent + attendanceTotals.excused;

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const bc of upcomingInstances) {
    const dow = new Date(bc.date + "T12:00:00Z").getUTCDay();
    const idx = dow === 0 ? 6 : dow - 1;
    byWeekday[idx] += bc.bookedCount;
  }
  const maxWeekday = Math.max(...byWeekday, 1);

  const allSubs = await getSubscriptionRepo().getAll();
  const activeSubs = allSubs.filter((s) => s.status === "active");
  const subsByType: Record<string, number> = {};
  for (const s of activeSubs) {
    subsByType[s.productType] = (subsByType[s.productType] ?? 0) + 1;
  }
  const studentsWithSub = new Set(activeSubs.map((s) => s.studentId)).size;

  const allStudents = await getStudentRepo().getAll();
  const allProducts = await getProductRepo().getAll();

  const dashboardData: AdminDashboardData = {
    todayStr,
    todaysClassCount,
    upcomingBookingCount,
    activeWaitlistCount,
    unresolvedPenaltyCount: unresolvedPenalties.length,
    unresolvedPenaltyTotal: unresolvedPenalties.reduce((s, p) => s + p.amountCents, 0),
    upcomingClasses: upcomingInstances.slice(0, 8).map(toSummary),
    demandClasses,
    partnerClasses,
    attendanceTotals,
    attendanceTotal,
    byWeekday,
    maxWeekday,
    subsByType,
    studentsWithSub,
    totalStudents: allStudents.length,
    totalProducts: allProducts.filter((p) => p.isActive).length,
  };

  return <AdminDashboard data={dashboardData} />;
}
