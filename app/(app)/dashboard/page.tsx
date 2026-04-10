import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getBookingRepo,
  getPenaltyRepo,
  getAttendanceRepo,
} from "@/lib/repositories";
import { cachedGetTerms, cachedGetProducts, cachedCocCheck, cachedGetStudentById, cachedGetStudentSubs, cachedGetAllSubs, cachedGetAllStudents } from "@/lib/server/cached-queries";
import { getCurrentTerm, getTermWeekNumber } from "@/lib/domain/term-rules";
import { getTodayStr, isClassEnded, isClassStarted, effectiveInstanceStatus } from "@/lib/domain/datetime";
import { runAttendanceClosure } from "@/lib/domain/attendance-closure";
import { lazyExpireSubscriptions } from "@/lib/actions/term-lifecycle";
import { daysUntilExpiry } from "@/lib/domain/term-lifecycle";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { computeBookability, type ClassInstanceInfo, type BookabilityContext } from "@/lib/domain/bookability";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { computeMemberBenefits, checkBirthdayBenefitEligibility } from "@/lib/domain/member-benefits";
import { getBirthdayRedemption } from "@/lib/services/birthday-benefit-store";
import { birthdayBenefitAvailableEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { isStripeEnabled } from "@/lib/stripe";
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
  const _t0 = performance.now();
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const _tAuth = performance.now();

  await ensureOperationalDataHydrated();
  const _tHydrate = performance.now();

  runAttendanceClosure();
  lazyExpireSubscriptions().catch(() => {});
  const _tLazy = performance.now();

  if (user.role === "student") {
    const bookingSvc = getBookingRepo().getService();
    const penaltySvc = getPenaltyRepo().getService();
    const attendanceSvc = getAttendanceRepo().getService();

    const year = new Date().getFullYear();
    const todayStr = getTodayStr();

    const [cocAccepted, student, terms, allProducts, allSubs, birthdayRedemption] = await Promise.all([
      cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version),
      cachedGetStudentById(user.id),
      cachedGetTerms(),
      cachedGetProducts(),
      cachedGetStudentSubs(user.id),
      getBirthdayRedemption(user.id, year),
    ]);
    const _tDb = performance.now();
    if (!cocAccepted) redirect("/onboarding");

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

    const activeSubs = allSubs.filter((s) => s.status === "active");
    const HISTORY_STATUSES = new Set(["expired", "exhausted", "cancelled", "paused"]);
    const historicalSubs = allSubs
      .filter((s) => HISTORY_STATUSES.has(s.status))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

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
        canToggleAutoRenew: sub.status === "active" && !!product?.autoRenew,
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

    const entitlements: StudentEntitlementSummary[] = [
      ...activeSubs.map(toSummary),
      ...historicalSubs.map(toSummary),
    ];

    let lastPlan: StudentEntitlementSummary | null = null;
    if (activeSubs.length === 0 && historicalSubs.length === 0) {
      const recent = allSubs
        .filter((s) => HISTORY_STATUSES.has(s.status))
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
          subscriptions: activeSubs,
          birthdayClassUsed: !!birthdayRedemption,
          birthdayClassTitle: birthdayRedemption?.classTitle,
          birthdayClassDate: birthdayRedemption?.classDate,
        })
      : null;

    const bdayEligibility = checkBirthdayBenefitEligibility({
      subscriptions: activeSubs,
      dateOfBirth: student?.dateOfBirth ?? null,
      referenceDate: todayStr,
      alreadyUsedThisYear: !!birthdayRedemption,
    });

    if (student && bdayEligibility.currentlyActive) {
      const expiresDate = bdayEligibility.weekRange?.sunday ?? todayStr;
      dispatchCommEvents([
        birthdayBenefitAvailableEvent({
          studentId: student.id,
          studentName: student.fullName,
          expiresDate,
          year,
        }),
      ]).catch(() => {});
    }

    const _tPrep = performance.now();
    const allInstances = getInstances();
    const danceStyles = getDanceStyles();
    const styleByName = new Map(danceStyles.map((s) => [s.name, s]));
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

    const dashboardBirthdayBenefit = bdayEligibility.potentiallyEligible
      ? {
          eligible: true as const,
          alreadyUsed: bdayEligibility.alreadyUsed,
          membershipSubscriptionId: bdayEligibility.membershipSubscriptionId!,
        }
      : undefined;

    // Pre-compute confirmed bookings stats per class for O(1) lookup
    const confirmedByClass = new Map<string, { total: number; leaders: number; followers: number }>();
    for (const b of bookingSvc.bookings) {
      if (b.status !== "confirmed" && b.status !== "checked_in") continue;
      let entry = confirmedByClass.get(b.bookableClassId);
      if (!entry) { entry = { total: 0, leaders: 0, followers: 0 }; confirmedByClass.set(b.bookableClassId, entry); }
      entry.total++;
      if (b.danceRole === "leader") entry.leaders++;
      else if (b.danceRole === "follower") entry.followers++;
    }

    const todayForYou: TodayForYouItem[] = allInstances
      .filter((c) => c.date === todayStr && !isClassEnded(c.date, c.endTime) && !isClassStarted(c.date, c.startTime))
      .flatMap((c) => {
        if (studentBookingClassIds.has(c.id) || studentWaitlistClassIds.has(c.id)) return [];

        if (c.styleName && c.level && BEGINNER_LEVELS.has(c.level) && advancedStyleSet.has(c.styleName)) {
          return [];
        }

        const style = c.styleName ? styleByName.get(c.styleName) : null;
        const stats = confirmedByClass.get(c.id);
        const requiresBalance = style?.requiresRoleBalance ?? false;
        const classInfo: ClassInstanceInfo = {
          id: c.id, title: c.title, classType: c.classType, styleName: c.styleName,
          styleId: c.styleId, level: c.level, date: c.date, startTime: c.startTime, endTime: c.endTime,
          status: c.status, location: c.location, maxCapacity: c.maxCapacity,
          leaderCap: c.leaderCap, followerCap: c.followerCap,
          danceStyleRequiresBalance: requiresBalance,
          currentLeaders: stats?.leaders ?? 0,
          currentFollowers: stats?.followers ?? 0,
          totalBooked: stats?.total ?? 0,
          termBound: c.termBound ?? false,
          termId: c.termId ?? null,
        };

        const ctx: BookabilityContext = {
          classInstance: classInfo,
          studentState: { activeBookingId: null, activeBookingStatus: null, waitlistEntry: null, cancelledBooking: null },
          studentSubscriptions: activeSubs,
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
    const _tEnd = performance.now();
    console.info(`[perf /dashboard] auth=${(_tAuth-_t0).toFixed(0)}ms hydrate=${(_tHydrate-_tAuth).toFixed(0)}ms lazy=${(_tLazy-_tHydrate).toFixed(0)}ms db=${(_tDb-_tLazy).toFixed(0)}ms prep+todayForYou=${(_tEnd-_tPrep).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

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
        stripeEnabled={isStripeEnabled()}
        codeOfConductAccepted={cocAccepted}
        benefits={benefits}
        qrToken={student?.qrToken ?? null}
        todayForYou={todayForYou}
        studentPreferredRole={student?.preferredRole ?? null}
      />
    );
  }

  const _tAdmin0 = performance.now();
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

  const upcomingClassIds = new Set(
    allInstances
      .filter((bc) => bc.date >= todayStr && !isClassEnded(bc.date, bc.endTime))
      .map((bc) => bc.id)
  );

  const ACTIVE_BOOKING_STATUSES = new Set(["confirmed", "checked_in"]);
  let upcomingBookingCount = 0;
  for (const b of bookingSvc.bookings) {
    if (ACTIVE_BOOKING_STATUSES.has(b.status) && upcomingClassIds.has(b.bookableClassId)) {
      upcomingBookingCount++;
    }
  }

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

  const attendanceTotals = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const a of attendanceSvc.records) {
    if (a.status === "present") attendanceTotals.present++;
    else if (a.status === "late") attendanceTotals.late++;
    else if (a.status === "absent") attendanceTotals.absent++;
    else if (a.status === "excused") attendanceTotals.excused++;
  }
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

  const [allSubs, allStudents, allProducts] = await Promise.all([
    cachedGetAllSubs(),
    cachedGetAllStudents(),
    cachedGetProducts(),
  ]);
  const activeSubs = allSubs.filter((s) => s.status === "active");
  const subsByType: Record<string, number> = {};
  for (const s of activeSubs) {
    subsByType[s.productType] = (subsByType[s.productType] ?? 0) + 1;
  }
  const studentsWithSub = new Set(activeSubs.map((s) => s.studentId)).size;

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

  const _tAdminEnd = performance.now();
  console.info(`[perf /dashboard admin] admin-path=${(_tAdminEnd-_tAdmin0).toFixed(0)}ms total=${(_tAdminEnd-_t0).toFixed(0)}ms`);

  return <AdminDashboard data={dashboardData} />;
}
