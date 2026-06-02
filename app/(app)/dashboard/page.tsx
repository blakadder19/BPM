import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getBookingRepo,
  getPenaltyRepo,
  getAttendanceRepo,
  getSpecialEventRepo,
  getReferralRepo,
} from "@/lib/repositories";
import { summarizeReferrals } from "@/lib/domain/referrals";
import { cachedGetTerms, cachedGetProducts, cachedCocCheck, cachedGetStudentById, cachedGetStudentSubs, cachedGetAllSubs, cachedGetAllStudents, cachedGetAllEvents } from "@/lib/server/cached-queries";
import { getCurrentTerm, getTermWeekNumber } from "@/lib/domain/term-rules";
import { getTodayStr, isClassEnded, isClassStarted, effectiveInstanceStatus, isEventEnded } from "@/lib/domain/datetime";
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
import {
  buildPerClassBookingStats,
  computeBookingsByWeekday,
  getClassStats,
  summarizeAttendanceWindow,
} from "@/lib/domain/admin-dashboard-stats";
import { isStripeEnabled } from "@/lib/stripe";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getSettings } from "@/lib/services/settings-store";
import { AdminDashboard, type AdminDashboardData, type DashboardClassSummary, type DashboardDemandItem, type DashboardEventSummary } from "@/components/dashboard/admin-dashboard";
import { getInstances } from "@/lib/services/schedule-store";
import {
  StudentDashboard,
  type StudentBookingSummary,
  type StudentTermInfo,
  type StudentEntitlementSummary,
  type TodayForYouItem,
  type DashboardEvent,
} from "@/components/dashboard/student-dashboard";

export default async function DashboardPage() {
  const _t0 = performance.now();
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const _tAuth = performance.now();

  if (user.role === "student") {
    const year = new Date().getFullYear();
    const todayStr = getTodayStr();

    // Run hydration AND direct-DB queries in parallel — the cachedGetXxx
    // calls go straight to Supabase and don't need hydration to complete.
    // Hydration only needs to finish before in-memory store reads below.
    const [, cocAccepted, student, terms, allProducts, allSubs, birthdayRedemption] = await Promise.all([
      ensureOperationalDataHydrated(),
      cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version),
      cachedGetStudentById(user.id),
      cachedGetTerms(),
      cachedGetProducts(),
      cachedGetStudentSubs(user.id),
      getBirthdayRedemption(user.id, year),
    ]);
    const _tHydrate = performance.now();

    runAttendanceClosure();
    lazyExpireSubscriptions().catch(() => {});

    if (!cocAccepted) redirect("/onboarding");

    const bookingSvc = getBookingRepo().getService();
    const attendanceSvc = getAttendanceRepo().getService();

    const instances = getInstances();
    const danceStyles = getDanceStyles();
    const styleByName = new Map(danceStyles.map((s) => [s.name, s]));
    bookingSvc.refreshClasses(
      instances.map((bc) => {
        const style = bc.styleName ? styleByName.get(bc.styleName) : null;
        return {
          id: bc.id,
          title: bc.title,
          classType: bc.classType,
          styleName: bc.styleName,
          danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
          status: bc.status,
          date: bc.date,
          startTime: bc.startTime,
          endTime: bc.endTime,
          maxCapacity: bc.maxCapacity,
          leaderCap: bc.leaderCap,
          followerCap: bc.followerCap,
          location: bc.location,
        };
      })
    );
    const _tDb = performance.now();

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
          danceStyleRequiresBalance: cls.danceStyleRequiresBalance ?? false,
          status: resolveStudentVisibleStatus(b.status, attRecord?.status),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null && !isClassEnded(b.date, b.endTime))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      );

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
        priceCentsAtPurchase: sub.priceCentsAtPurchase,
        originalPriceCents: sub.originalPriceCents,
        discountAmountCents: sub.discountAmountCents,
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
      ? bookingSvc.getWaitlistForStudent(student.id)
          .filter((w) => {
            const cls = bookingSvc.getClass(w.bookableClassId);
            return cls ? !isClassEnded(cls.date, cls.endTime) : false;
          }).length
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
    const allInstances = instances;
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

    const {
      beginnerLevelNames,
      allowBeginnerNextTermAdvanceBooking,
      beginnerIntakeBookingWeeks,
    } = getSettings();
    const BEGINNER_LEVELS = new Set(beginnerLevelNames);

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
          beginnerLevelNames,
          allowBeginnerNextTermAdvanceBooking,
          beginnerIntakeBookingWeeks,
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
    if (process.env.NODE_ENV === "development") console.info(`[perf /dashboard] auth=${(_tAuth-_t0).toFixed(0)}ms hydrate+db=${(_tHydrate-_tAuth).toFixed(0)}ms prep+todayForYou=${(_tEnd-_tPrep).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

    const allEvents = await cachedGetAllEvents();
    const promotedEvents = allEvents.filter(
      (e) =>
        e.status === "published" &&
        e.isVisible &&
        !e.archivedAt &&
        e.featuredOnDashboard &&
        !isEventEnded(e.endDate),
    );

    const evtRepo = getSpecialEventRepo();
    const studentEventPurchases = student ? await evtRepo.getPurchasesByStudent(student.id) : [];
    const EXCLUDED_PURCHASE_STATUSES = new Set(["refunded", "cancelled"]);
    const SETTLED_PURCHASE_STATUSES = new Set(["paid", "complimentary", "waived"]);
    const activePurchases = studentEventPurchases.filter(
      (p) => !EXCLUDED_PURCHASE_STATUSES.has(p.paymentStatus ?? "")
    );

    const ownedEventIds = new Set(activePurchases.map((p) => p.eventId));
    const dashboardEventsMap = new Map<string, DashboardEvent>();

    for (const evt of promotedEvents) {
      dashboardEventsMap.set(evt.id, { event: evt, reason: "promoted" });
    }

    for (const pur of activePurchases) {
      const evt = allEvents.find((e) => e.id === pur.eventId);
      if (!evt || evt.status !== "published" || !evt.isVisible || evt.archivedAt || isEventEnded(evt.endDate)) continue;
      const evtProducts = await evtRepo.getProductsByEvent(evt.id);
      const product = evtProducts.find((p) => p.id === pur.eventProductId);
      const existing = dashboardEventsMap.get(evt.id);
      if (!existing || existing.reason === "promoted") {
        dashboardEventsMap.set(evt.id, {
          event: evt,
          reason: "owned",
          purchaseStatus: SETTLED_PURCHASE_STATUSES.has(pur.paymentStatus ?? "") ? "paid" : "pending",
          purchaseProductName: product?.name ?? null,
        });
      }
    }

    const dashboardEventsList = Array.from(dashboardEventsMap.values()).sort((a, b) => {
      if (a.reason === "owned" && b.reason !== "owned") return -1;
      if (a.reason !== "owned" && b.reason === "owned") return 1;
      return a.event.startDate.localeCompare(b.event.startDate);
    });

    // Referral programme (Phase 3): lazily allocate a stable code and
    // surface verified/pending counts on the dashboard widget. We swallow
    // errors here so a referral-store outage cannot break the dashboard.
    let referralCode: string | null = null;
    let referralCounts: { verified: number; pending: number } | null = null;
    try {
      const referralRepo = getReferralRepo();
      const [code, myReferrals] = await Promise.all([
        referralRepo.getCodeForStudent(user.id),
        referralRepo.getReferralsByReferrer(user.id),
      ]);
      referralCode = code;
      const summary = summarizeReferrals(myReferrals);
      referralCounts = { verified: summary.verified, pending: summary.pending };
    } catch {
      referralCode = null;
      referralCounts = null;
    }

    return (
      <StudentDashboard
        fullName={user.fullName}
        dateOfBirth={student?.dateOfBirth ?? null}
        upcomingBookings={upcomingBookings}
        termInfo={termInfo}
        entitlements={entitlements}
        lastPlan={lastPlan}
        waitlistedCount={waitlistedCount}
        stripeEnabled={isStripeEnabled()}
        codeOfConductAccepted={cocAccepted}
        benefits={benefits}
        qrToken={student?.qrToken ?? null}
        referralCode={referralCode}
        referralCounts={referralCounts}
        todayForYou={todayForYou}
        studentPreferredRole={student?.preferredRole ?? null}
        dashboardEvents={dashboardEventsList}
      />
    );
  }

  await ensureOperationalDataHydrated();
  runAttendanceClosure();
  lazyExpireSubscriptions().catch(() => {});

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

  // ── Per-class booking stats from canonical bookings table ──
  //
  // The Supabase schedule repo always returns `bookedCount=0` etc.
  // on the instance row (those denormalised fields exist only in
  // the mock-data schema). Derive real counts from the bookings
  // service — same source the Classes admin page uses via
  // `getConfirmedBookingsForClass()`. Without this fix, Upcoming
  // Classes / Highest Demand / Leader-Follower / Bookings by
  // Weekday all show zero in production.
  const classStatsTable = buildPerClassBookingStats(
    bookingSvc.bookings,
    bookingSvc.waitlist,
  );

  let upcomingBookingCount = 0;
  for (const classId of upcomingClassIds) {
    upcomingBookingCount += getClassStats(classStatsTable, classId).bookedCount;
  }
  const activeWaitlistCount = Array.from(upcomingClassIds).reduce(
    (sum, classId) => sum + getClassStats(classStatsTable, classId).waitlistCount,
    0,
  );

  const unresolvedPenalties = penaltySvc.penalties.filter(
    (p) => p.resolution === "monetary_pending"
  );

  const toSummary = (bc: typeof allInstances[number]): DashboardClassSummary => {
    const stats = getClassStats(classStatsTable, bc.id);
    return {
      id: bc.id,
      title: bc.title,
      date: bc.date,
      startTime: bc.startTime,
      endTime: bc.endTime,
      location: bc.location,
      status: effectiveInstanceStatus(bc.status, bc.date, bc.startTime, bc.endTime),
      maxCapacity: bc.maxCapacity,
      bookedCount: stats.bookedCount,
      waitlistCount: stats.waitlistCount,
      leaderCap: bc.leaderCap,
      followerCap: bc.followerCap,
      leaderCount: stats.leaderCount,
      followerCount: stats.followerCount,
      styleName: bc.styleName,
    };
  };

  const demandClasses: DashboardDemandItem[] = upcomingInstances
    .filter((bc) => bc.maxCapacity && bc.maxCapacity > 0)
    .map((bc) => {
      const summary = toSummary(bc);
      return {
        ...summary,
        fillRate: summary.bookedCount / bc.maxCapacity!,
      };
    })
    .sort((a, b) => b.fillRate - a.fillRate)
    .slice(0, 5);

  const partnerClasses = upcomingInstances
    .filter((bc) => bc.leaderCap !== null && bc.followerCap !== null)
    .map(toSummary)
    // Only surface partner classes that actually have role bookings
    // — using the freshly-computed leader/follower counts, not the
    // stale instance fields that used to filter this list to empty.
    .filter((bc) => bc.leaderCount > 0 || bc.followerCount > 0);

  // ── Attendance summary (last 30 days) ──────────────────────
  //
  // Scoped to a rolling 30-day window to match operational
  // reality: the closure job has been writing records for months
  // and an all-time aggregate is dominated by stale data, which is
  // what produced the misleading 100% / 62 reading in production.
  const ATTENDANCE_WINDOW_DAYS = 30;
  const attendanceSummary = summarizeAttendanceWindow(
    attendanceSvc.records,
    todayStr,
    ATTENDANCE_WINDOW_DAYS,
  );
  const attendanceTotals = attendanceSummary.totals;
  const attendanceTotal = attendanceSummary.total;

  // ── Bookings by weekday ────────────────────────────────────
  //
  // Counts active (confirmed + checked-in) bookings, bucketed by
  // the class instance's weekday. Uses real bookings — the
  // previous implementation summed the stale `bc.bookedCount`
  // (always 0 in Supabase mode), which is why production showed
  // "No booking data available yet".
  const instanceDateById = new Map(allInstances.map((bc) => [bc.id, bc.date]));
  const byWeekday = computeBookingsByWeekday(bookingSvc.bookings, {
    getClassDate: (id) => instanceDateById.get(id) ?? null,
  });
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

  // ── Event purchases / pending payments ────────────────────
  //
  // Previously this section did one `getPurchasesByEvent` and one
  // `getProductsByEvent` query per event, serially. With ~N events
  // that's 2N round trips just to render the dashboard. We replace
  // that fan-out with a single `getAllPurchases()` (one query) and
  // a single per-upcoming-event product fetch — performed in
  // parallel and only for events that actually appear in
  // `upcomingEvents` or contribute to `pendingEventPayments`.
  const evtRepo = getSpecialEventRepo();
  const allEvts = await evtRepo.getAllEvents();
  const allPurchases = await evtRepo.getAllPurchases();

  // Index purchases by event_id for O(1) per-event lookup below.
  const purchasesByEventId = new Map<string, typeof allPurchases>();
  for (const pur of allPurchases) {
    const list = purchasesByEventId.get(pur.eventId);
    if (list) list.push(pur);
    else purchasesByEventId.set(pur.eventId, [pur]);
  }

  // Resolve the union of event ids we still need product names for
  // (only pending-payment lines use a product name).
  const eventIdsNeedingProducts = new Set<string>();
  for (const pur of allPurchases) {
    if (pur.paymentStatus === "pending") eventIdsNeedingProducts.add(pur.eventId);
  }
  const productMapsByEventId = new Map<string, Map<string, { id: string; name: string }>>();
  if (eventIdsNeedingProducts.size > 0) {
    const productLists = await Promise.all(
      Array.from(eventIdsNeedingProducts).map(async (eid) => ({
        eid,
        products: await evtRepo.getProductsByEvent(eid),
      })),
    );
    for (const { eid, products } of productLists) {
      productMapsByEventId.set(
        eid,
        new Map(products.map((p) => [p.id, { id: p.id, name: p.name }])),
      );
    }
  }

  const pendingEventPayments: { studentId: string | null; eventTitle: string; productName: string; eventId: string }[] = [];
  const upcomingEvents: DashboardEventSummary[] = [];
  for (const evt of allEvts) {
    const purchases = purchasesByEventId.get(evt.id) ?? [];
    for (const pur of purchases) {
      if (pur.paymentStatus === "pending") {
        const prod = productMapsByEventId.get(evt.id)?.get(pur.eventProductId);
        pendingEventPayments.push({
          studentId: pur.studentId,
          eventTitle: evt.title,
          productName: prod?.name ?? "Unknown product",
          eventId: evt.id,
        });
      }
    }
    if (evt.status === "published" && !evt.archivedAt && !isEventEnded(evt.endDate)) {
      const nonRefunded = purchases.filter((p) => p.paymentStatus !== "refunded");
      upcomingEvents.push({
        id: evt.id,
        title: evt.title,
        startDate: evt.startDate,
        endDate: evt.endDate,
        totalSold: nonRefunded.length,
        totalPaid: nonRefunded.filter((p) => p.paymentStatus === "paid").length,
        totalPending: nonRefunded.filter((p) => p.paymentStatus === "pending").length,
        overallCapacity: evt.overallCapacity,
      });
    }
  }
  upcomingEvents.sort((a, b) => a.startDate.localeCompare(b.startDate));

  const studentNameMap: Record<string, string> = {};
  for (const s of allStudents) studentNameMap[s.id] = s.fullName;

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
    attendanceWindowDays: ATTENDANCE_WINDOW_DAYS,
    byWeekday,
    maxWeekday,
    subsByType,
    studentsWithSub,
    totalStudents: allStudents.length,
    totalProducts: allProducts.filter((p) => p.isActive).length,
    pendingEventPayments: pendingEventPayments.map((p) => ({
      ...p,
      studentName: p.studentId ? (studentNameMap[p.studentId] ?? p.studentId) : "Guest",
    })),
    upcomingEvents,
  };

  const _tAdminEnd = performance.now();
  if (process.env.NODE_ENV === "development") console.info(`[perf /dashboard admin] admin-path=${(_tAdminEnd-_tAdmin0).toFixed(0)}ms total=${(_tAdminEnd-_t0).toFixed(0)}ms`);

  return <AdminDashboard data={dashboardData} />;
}
