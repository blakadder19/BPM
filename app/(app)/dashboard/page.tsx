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
import { getTodayStr, isClassEnded, isClassStarted, effectiveInstanceStatus } from "@/lib/domain/datetime";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import { lazyExpireSubscriptions } from "@/lib/actions/term-lifecycle";
import { daysUntilExpiry } from "@/lib/domain/term-lifecycle";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { computeBookability, type ClassInstanceInfo, type BookabilityContext } from "@/lib/domain/bookability";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { computeMemberBenefits } from "@/lib/domain/member-benefits";
import { BIRTHDAY_WEEK_DURATION_DAYS } from "@/config/business-rules";
import { isBirthdayClassUsed, getBirthdayRedemption } from "@/lib/services/birthday-benefit-store";
import { birthdayBenefitAvailableEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { AdminDashboard, type AdminDashboardData, type DashboardClassSummary, type DashboardDemandItem } from "@/components/dashboard/admin-dashboard";
import { getInstances } from "@/lib/services/schedule-store";
import {
  StudentDashboard,
  type StudentBookingSummary,
  type StudentPenaltySummary,
  type StudentTermInfo,
  type StudentEntitlementSummary,
  type TodayForYouItem,
} from "@/components/dashboard/student-dashboard";

export default async function DashboardPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  await ensureOperationalDataHydrated();

  runAttendanceClosure();
  await lazyExpireSubscriptions();

  if (user.role === "student") {
    const cocAccepted = await getCocRepo().hasAcceptedVersion(
      user.id,
      CURRENT_CODE_OF_CONDUCT.version
    );
    if (!cocAccepted) redirect("/onboarding");

    const bookingSvc = getBookingRepo().getService();
    const penaltySvc = getPenaltyRepo().getService();
    const attendanceSvc = getAttendanceRepo().getService();

    const [student, terms] = await Promise.all([
      getStudentRepo().getById(user.id),
      getTermRepo().getAll(),
    ]);

    const todayStr = getTodayStr();

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

    const year = new Date().getFullYear();
    const [allSubs, birthdayRedemption, allProducts] = await Promise.all([
      student ? getSubscriptionRepo().getByStudent(student.id) : Promise.resolve([]),
      student ? getBirthdayRedemption(student.id, year) : Promise.resolve(null),
      getProductRepo().getAll(),
    ]);

    const studentSubs = allSubs.filter((s) => s.status === "active");

    function toSummary(sub: typeof allSubs[number]): StudentEntitlementSummary {
      const product = allProducts.find((p) => p.id === sub.productId);
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
        daysUntilExpiry: daysUntilExpiry(sub, todayStr),
        isRenewal: !!sub.renewedFromId,
        isFutureTerm: sub.validFrom > todayStr,
      };
    }

    const entitlements: StudentEntitlementSummary[] = studentSubs.map(toSummary);

    let lastPlan: StudentEntitlementSummary | null = null;
    if (entitlements.length === 0) {
      const TERMINAL = new Set(["expired", "exhausted", "cancelled"]);
      const recent = allSubs
        .filter((s) => TERMINAL.has(s.status))
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
      if (recent) {
        lastPlan = toSummary(recent);
      }
    }

    const waitlistedCount = student
      ? bookingSvc.getWaitlistForStudent(student.id).length
      : 0;

    const benefits = student
      ? computeMemberBenefits({
          dateOfBirth: student.dateOfBirth,
          referenceDate: todayStr,
          subscriptions: studentSubs,
          birthdayClassUsed: !!birthdayRedemption,
          birthdayClassTitle: birthdayRedemption?.classTitle,
          birthdayClassDate: birthdayRedemption?.classDate,
        })
      : null;

    if (
      student &&
      benefits?.birthdayWeekEligible &&
      !benefits.birthdayFreeClassUsed &&
      student.dateOfBirth
    ) {
      const expiresDate = new Date();
      expiresDate.setDate(expiresDate.getDate() + BIRTHDAY_WEEK_DURATION_DAYS);
      dispatchCommEvents([
        birthdayBenefitAvailableEvent({
          studentId: student.id,
          studentName: student.fullName,
          expiresDate: expiresDate.toISOString().slice(0, 10),
          year,
        }),
      ]).catch(() => {});
    }

    const allInstances = getInstances();
    const danceStyles = getDanceStyles();
    const accessRulesMap = buildDynamicAccessRulesMap(allProducts, danceStyles);
    const studentId = student?.id ?? "";

    const studentBookingClassIds = new Set(
      bookingSvc.bookings
        .filter((b) => b.studentId === studentId && (b.status === "confirmed" || b.status === "checked_in"))
        .map((b) => b.bookableClassId)
    );
    const studentWaitlistClassIds = new Set(
      bookingSvc.getWaitlistForStudent(studentId).map((w) => w.bookableClassId)
    );

    // Determine styles where student has booked/attended above beginner
    const advancedStyleSet = new Set<string>();
    const ABOVE_BEGINNER = new Set(["Improvers", "Intermediate", "Open"]);
    const instanceMap = new Map(allInstances.map((i) => [i.id, i]));
    for (const b of bookingSvc.bookings) {
      if (b.studentId !== studentId) continue;
      if (b.status !== "confirmed" && b.status !== "checked_in") continue;
      const inst = instanceMap.get(b.bookableClassId);
      if (inst?.styleName && inst.level && ABOVE_BEGINNER.has(inst.level)) {
        advancedStyleSet.add(inst.styleName);
      }
    }

    const BEGINNER_LEVELS = new Set(["Beginner 1", "Beginner 2"]);

    // Birthday benefit for "Today for you" bookability
    let dashboardBirthdayBenefit: import("@/lib/domain/bookability").BirthdayBenefitState | undefined;
    const activeMembership = studentSubs.find(
      (s) => s.productType === "membership" && s.status === "active"
    );
    if (activeMembership && student?.dateOfBirth && benefits?.birthdayWeekEligible && !benefits?.birthdayFreeClassUsed) {
      dashboardBirthdayBenefit = {
        eligible: true,
        alreadyUsed: false,
        membershipSubscriptionId: activeMembership.id,
      };
    }

    const todayForYou: TodayForYouItem[] = allInstances
      .filter((c) => c.date === todayStr && !isClassEnded(c.date, c.endTime) && !isClassStarted(c.date, c.startTime))
      .flatMap((c) => {
        if (studentBookingClassIds.has(c.id) || studentWaitlistClassIds.has(c.id)) return [];

        if (c.styleName && c.level && BEGINNER_LEVELS.has(c.level) && advancedStyleSet.has(c.styleName)) {
          return [];
        }

        const style = c.styleName ? danceStyles.find((s) => s.name === c.styleName) : null;
        const confirmedForClass = bookingSvc.getConfirmedBookingsForClass(c.id);
        const requiresBalance = style?.requiresRoleBalance ?? false;
        const classInfo: ClassInstanceInfo = {
          id: c.id, title: c.title, classType: c.classType, styleName: c.styleName,
          styleId: c.styleId, level: c.level, date: c.date, startTime: c.startTime, endTime: c.endTime,
          status: c.status, location: c.location, maxCapacity: c.maxCapacity,
          leaderCap: c.leaderCap, followerCap: c.followerCap,
          danceStyleRequiresBalance: requiresBalance,
          currentLeaders: confirmedForClass.filter((b) => b.danceRole === "leader").length,
          currentFollowers: confirmedForClass.filter((b) => b.danceRole === "follower").length,
          totalBooked: confirmedForClass.length,
          termBound: c.termBound ?? false,
          termId: c.termId ?? null,
        };

        const ctx: BookabilityContext = {
          classInstance: classInfo,
          studentState: { activeBookingId: null, activeBookingStatus: null, waitlistEntry: null, cancelledBooking: null },
          studentSubscriptions: studentSubs,
          terms,
          accessRulesMap,
          studentPreferredRole: student?.preferredRole ?? null,
          codeOfConductAccepted: cocAccepted,
          birthdayBenefit: dashboardBirthdayBenefit,
          studentDateOfBirth: student?.dateOfBirth ?? null,
        };

        const result = computeBookability(ctx);
        if (result.status !== "bookable" && result.status !== "waitlistable") return [];

        return [{
          id: c.id,
          title: c.title,
          styleName: c.styleName,
          level: c.level,
          date: c.date,
          startTime: c.startTime,
          endTime: c.endTime,
          location: c.location,
          spotsLeft: c.maxCapacity != null ? c.maxCapacity - c.bookedCount : null,
          danceStyleRequiresBalance: requiresBalance,
          entitlements: result.entitlements,
          autoSelected: result.status === "bookable" ? result.autoSelected : undefined,
          isWaitlist: result.status === "waitlistable",
          waitlistReason: result.status === "waitlistable" ? result.reason : undefined,
        }];
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return (
      <StudentDashboard
        fullName={user.fullName}
        dateOfBirth={student?.dateOfBirth ?? null}
        upcomingBookings={upcomingBookings}
        penalties={penalties}
        termInfo={termInfo}
        entitlements={entitlements}
        lastPlan={lastPlan}
        waitlistedCount={waitlistedCount}
        codeOfConductAccepted={cocAccepted}
        benefits={benefits}
        qrToken={student?.qrToken ?? null}
        todayForYou={todayForYou}
        studentPreferredRole={student?.preferredRole ?? null}
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
