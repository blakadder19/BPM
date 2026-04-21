import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getTemplates } from "@/lib/services/class-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { getSettings } from "@/lib/services/settings-store";
import { getInstances } from "@/lib/services/schedule-store";
import {
  getBookingRepo,
} from "@/lib/repositories";
import { cachedGetTerms, cachedGetProducts, cachedCocCheck, cachedGetStudentById, cachedGetStudentSubs } from "@/lib/server/cached-queries";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { isClassInFuture, getTodayStr } from "@/lib/domain/datetime";
import { getCurrentTerm, getNextTerm } from "@/lib/domain/term-rules";
import { lazyExpireSubscriptions } from "@/lib/actions/term-lifecycle";

import { computeBookability, type ClassInstanceInfo, type BookabilityContext } from "@/lib/domain/bookability";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { isBirthdayClassUsed } from "@/lib/services/birthday-benefit-store";
import { checkBirthdayBenefitEligibility } from "@/lib/domain/member-benefits";
import { AdminTemplates } from "@/components/classes/admin-templates";
import { ClassBrowser } from "@/components/booking/class-browser";
import type { ClassCardData } from "@/components/booking/student-class-card";

export default async function ClassesPage() {
  const _t0 = performance.now();
  const user = await requireRole(["admin", "teacher", "student"]);
  const _tAuth = performance.now();

  if (user.role === "student") {
    // Run hydration AND direct-DB queries in parallel
    const [, cocDone, terms, allStudentSubs, allProducts, student, bdayUsed] = await Promise.all([
      ensureOperationalDataHydrated(),
      cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version),
      cachedGetTerms(),
      cachedGetStudentSubs(user.id),
      cachedGetProducts(),
      cachedGetStudentById(user.id),
      isBirthdayClassUsed(user.id, new Date().getFullYear()),
    ]);
    const _tDb = performance.now();

    lazyExpireSubscriptions().catch(() => {});

    const danceStyles = getDanceStyles();
    const instances = getInstances();
    const svc = getBookingRepo().getService();
    if (!cocDone) redirect("/onboarding");

    const accessRulesMap = buildDynamicAccessRulesMap(allProducts, danceStyles);

    // Pre-index dance styles by name for O(1) lookup instead of per-class .find()
    const styleByName = new Map(danceStyles.map((s) => [s.name, s]));

    svc.refreshClasses(
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

    const studentId = student?.id ?? "";
    const studentSubs = allStudentSubs.filter((s) => s.status === "active");
    const studentBookings = svc.getBookingsForStudent(studentId);
    const studentWaitlist = svc.getWaitlistForStudent(studentId);

    // Pre-index student bookings and waitlist by classId for O(1) lookups
    const bookingsByClass = new Map<string, typeof studentBookings>();
    for (const b of studentBookings) {
      let list = bookingsByClass.get(b.bookableClassId);
      if (!list) { list = []; bookingsByClass.set(b.bookableClassId, list); }
      list.push(b);
    }
    const waitlistByClass = new Map<string, (typeof studentWaitlist)[number]>();
    for (const w of studentWaitlist) {
      waitlistByClass.set(w.bookableClassId, w);
    }

    // Pre-compute confirmed bookings per class to avoid full-scan per class
    const confirmedByClass = new Map<string, { total: number; leaders: number; followers: number }>();
    for (const b of svc.bookings) {
      if (b.status !== "confirmed" && b.status !== "checked_in") continue;
      let entry = confirmedByClass.get(b.bookableClassId);
      if (!entry) { entry = { total: 0, leaders: 0, followers: 0 }; confirmedByClass.set(b.bookableClassId, entry); }
      entry.total++;
      if (b.danceRole === "leader") entry.leaders++;
      else if (b.danceRole === "follower") entry.followers++;
    }

    const cocAccepted = cocDone;
    const bdayEligibility = checkBirthdayBenefitEligibility({
      subscriptions: studentSubs,
      dateOfBirth: student?.dateOfBirth ?? null,
      referenceDate: getTodayStr(),
      alreadyUsedThisYear: bdayUsed,
    });
    const classesBirthdayBenefit = bdayEligibility.potentiallyEligible
      ? {
          eligible: true as const,
          alreadyUsed: bdayEligibility.alreadyUsed,
          membershipSubscriptionId: bdayEligibility.membershipSubscriptionId!,
        }
      : undefined;
    const _tPrep = performance.now();

    const futureInstances = instances
      .filter((c) => isClassInFuture(c.date, c.startTime))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    const classCards: ClassCardData[] = futureInstances.map((rawCls) => {
      const style = rawCls.styleName ? styleByName.get(rawCls.styleName) : null;

      const stats = confirmedByClass.get(rawCls.id);
      const classInfo: ClassInstanceInfo = {
        id: rawCls.id,
        title: rawCls.title,
        classType: rawCls.classType,
        styleName: rawCls.styleName,
        styleId: rawCls.styleId,
        level: rawCls.level,
        date: rawCls.date,
        startTime: rawCls.startTime,
        endTime: rawCls.endTime,
        status: rawCls.status,
        location: rawCls.location,
        maxCapacity: rawCls.maxCapacity,
        leaderCap: rawCls.leaderCap,
        followerCap: rawCls.followerCap,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
        currentLeaders: stats?.leaders ?? 0,
        currentFollowers: stats?.followers ?? 0,
        totalBooked: stats?.total ?? 0,
        termBound: rawCls.termBound ?? false,
        termId: rawCls.termId ?? null,
      };

      const classBookings = bookingsByClass.get(rawCls.id);
      const activeBooking = classBookings?.find(
        (b) => b.status === "confirmed" || b.status === "checked_in"
      );
      const waitlistEntry = waitlistByClass.get(rawCls.id);
      const cancelledBooking = !activeBooking
        ? classBookings?.find(
            (b) => b.status === "cancelled" || b.status === "late_cancelled"
          )
        : undefined;

      const ctx: BookabilityContext = {
        classInstance: classInfo,
        studentState: {
          activeBookingId: activeBooking?.id ?? null,
          activeBookingStatus: activeBooking?.status ?? null,
          waitlistEntry: waitlistEntry
            ? { id: waitlistEntry.id, position: waitlistEntry.position }
            : null,
          cancelledBooking: cancelledBooking
            ? { id: cancelledBooking.id, status: cancelledBooking.status }
            : null,
        },
        studentSubscriptions: studentSubs,
        terms,
        accessRulesMap,
        studentPreferredRole: student?.preferredRole ?? null,
        codeOfConductAccepted: cocAccepted,
        birthdayBenefit: classesBirthdayBenefit,
        studentDateOfBirth: student?.dateOfBirth ?? null,
      };

      const bookability = computeBookability(ctx);

      return {
        id: rawCls.id,
        classId: rawCls.classId,
        title: rawCls.title,
        classType: rawCls.classType,
        styleName: rawCls.styleName,
        level: rawCls.level,
        date: rawCls.date,
        startTime: rawCls.startTime,
        endTime: rawCls.endTime,
        location: rawCls.location,
        maxCapacity: rawCls.maxCapacity,
        totalBooked: stats?.total ?? 0,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
        bookability,
      };
    });
    const _tLoop = performance.now();

    const todayStr = getTodayStr();
    const currentTerm = getCurrentTerm(terms, todayStr);
    const nextTerm = getNextTerm(terms, todayStr);
    const termInfo = currentTerm
      ? { name: currentTerm.name ?? "Current Term", startDate: currentTerm.startDate, endDate: currentTerm.endDate }
      : nextTerm
        ? { name: nextTerm.name ?? "Next Term", startDate: nextTerm.startDate, endDate: nextTerm.endDate }
        : null;

    const _tEnd = performance.now();
    if (process.env.NODE_ENV === "development") console.info(`[perf /classes] auth=${(_tAuth-_t0).toFixed(0)}ms hydrate+db=${(_tDb-_tAuth).toFixed(0)}ms prep=${(_tPrep-_tDb).toFixed(0)}ms loop(${futureInstances.length}cls)=${(_tLoop-_tPrep).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

    return (
      <ClassBrowser
        classes={classCards}
        codeOfConductAccepted={cocAccepted}
        studentPreferredRole={student?.preferredRole ?? null}
        today={todayStr}
        termInfo={termInfo}
      />
    );
  }

  await ensureOperationalDataHydrated();
  lazyExpireSubscriptions().catch(() => {});

  const danceStyles = getDanceStyles();
  const templates = getTemplates().map((t) => ({ ...t }));
  const teacherAssignments = getAssignments().map((a) => ({ ...a }));
  const allStyles = danceStyles.map((s) => ({ id: s.id, name: s.name }));
  const terms = await cachedGetTerms();
  const allTerms = terms.map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate }));
  const settings = getSettings();
  const nameMap = buildTeacherNameMap();
  const teacherNameMap = Object.fromEntries(nameMap);
  const isDev = process.env.NODE_ENV === "development";

  return (
    <AdminTemplates
      templates={templates}
      allStyles={allStyles}
      allTerms={allTerms}
      settings={{
        roleBalancedStyleNames: settings.roleBalancedStyleNames ?? [],
        socialsBookable: settings.socialsBookable,
        weeklyEventsBookable: settings.weeklyEventsBookable,
        studentPracticeBookable: settings.studentPracticeBookable,
      }}
      teacherAssignments={teacherAssignments}
      teacherNameMap={teacherNameMap}
      isDev={isDev}
    />
  );
}
