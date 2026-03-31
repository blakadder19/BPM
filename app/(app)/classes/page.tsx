import { requireRole } from "@/lib/auth";
import { getTemplates } from "@/lib/services/class-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { getSettings } from "@/lib/services/settings-store";
import { getInstances } from "@/lib/services/schedule-store";
import {
  getBookingRepo,
  getSubscriptionRepo,
  getTermRepo,
  getStudentRepo,
  getCocRepo,
} from "@/lib/repositories";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { getProductRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { isClassInFuture, getTodayStr } from "@/lib/domain/datetime";
import { getCurrentTerm, getNextTerm } from "@/lib/domain/term-rules";

import { computeBookability, type ClassInstanceInfo, type BookabilityContext } from "@/lib/domain/bookability";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { AdminTemplates } from "@/components/classes/admin-templates";
import { ClassBrowser } from "@/components/booking/class-browser";
import type { ClassCardData } from "@/components/booking/student-class-card";

export default async function ClassesPage() {
  const user = await requireRole(["admin", "teacher", "student"]);

  await ensureOperationalDataHydrated();

  const danceStyles = getDanceStyles();

  if (user.role === "student") {
    const instances = getInstances();
    const svc = getBookingRepo().getService();
    const terms = await getTermRepo().getAll();
    const allSubs = await getSubscriptionRepo().getAll();
    const allProducts = await getProductRepo().getAll();
    const accessRulesMap = buildDynamicAccessRulesMap(allProducts);

    svc.refreshClasses(
      instances.map((bc) => {
        const style = bc.styleName
          ? danceStyles.find((s) => s.name === bc.styleName)
          : null;
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

    const student = await getStudentRepo().getById(user.id);

    const studentId = student?.id ?? "";
    const studentSubs = allSubs.filter(
      (s) => s.studentId === studentId && s.status === "active"
    );
    const studentBookings = svc.getBookingsForStudent(studentId);
    const studentWaitlist = svc.getWaitlistForStudent(studentId);

    const cocAccepted = await getCocRepo().hasAcceptedVersion(user.id, CURRENT_CODE_OF_CONDUCT.version);

    const futureInstances = instances
      .filter((c) => isClassInFuture(c.date, c.startTime))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    const classCards: ClassCardData[] = futureInstances.map((rawCls) => {
      const style = rawCls.styleName
        ? danceStyles.find((s) => s.name === rawCls.styleName)
        : null;

      const confirmedForClass = svc.getConfirmedBookingsForClass(rawCls.id);
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
        currentLeaders: confirmedForClass.filter((b) => b.danceRole === "leader").length,
        currentFollowers: confirmedForClass.filter((b) => b.danceRole === "follower").length,
        totalBooked: confirmedForClass.length,
        termBound: rawCls.termBound ?? false,
        termId: rawCls.termId ?? null,
      };

      const activeBooking = studentBookings.find(
        (b) =>
          b.bookableClassId === rawCls.id &&
          (b.status === "confirmed" || b.status === "checked_in")
      );
      const waitlistEntry = studentWaitlist.find(
        (w) => w.bookableClassId === rawCls.id
      );
      const cancelledBooking = !activeBooking
        ? studentBookings.find(
            (b) =>
              b.bookableClassId === rawCls.id &&
              (b.status === "cancelled" || b.status === "late_cancelled")
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
      };

      const bookability = computeBookability(ctx);

      return {
        id: rawCls.id,
        title: rawCls.title,
        classType: rawCls.classType,
        styleName: rawCls.styleName,
        level: rawCls.level,
        date: rawCls.date,
        startTime: rawCls.startTime,
        endTime: rawCls.endTime,
        location: rawCls.location,
        maxCapacity: rawCls.maxCapacity,
        totalBooked: confirmedForClass.length,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
        bookability,
      };
    });

    const todayStr = getTodayStr();
    const currentTerm = getCurrentTerm(terms, todayStr);
    const nextTerm = getNextTerm(terms, todayStr);
    const termInfo = currentTerm
      ? { name: currentTerm.name ?? "Current Term", startDate: currentTerm.startDate, endDate: currentTerm.endDate }
      : nextTerm
        ? { name: nextTerm.name ?? "Next Term", startDate: nextTerm.startDate, endDate: nextTerm.endDate }
        : null;

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

  const templates = getTemplates().map((t) => ({ ...t }));
  const teacherAssignments = getAssignments().map((a) => ({ ...a }));
  const allStyles = danceStyles.map((s) => ({ id: s.id, name: s.name }));
  const terms = await getTermRepo().getAll();
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
