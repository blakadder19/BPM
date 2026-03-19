import { requireRole } from "@/lib/auth";
import { getTemplates } from "@/lib/services/class-store";
import { getAssignments } from "@/lib/services/teacher-store";
import { buildTeacherNameMap } from "@/lib/services/teacher-roster-store";
import { getSettings } from "@/lib/services/settings-store";
import { getInstances } from "@/lib/services/schedule-store";
import { getBookingService } from "@/lib/services/booking-store";
import { getSubscriptions } from "@/lib/services/subscription-store";
import { getTerms } from "@/lib/services/term-store";
import { getAccessRulesMap } from "@/config/product-access";
import { DANCE_STYLES, STUDENTS } from "@/lib/mock-data";
import { isClassInFuture } from "@/lib/domain/datetime";
import { computeBookability, type ClassInstanceInfo, type BookabilityContext } from "@/lib/domain/bookability";
import { AdminTemplates } from "@/components/classes/admin-templates";
import { ClassBrowser } from "@/components/booking/class-browser";
import type { ClassCardData } from "@/components/booking/student-class-card";

export default async function ClassesPage() {
  const user = await requireRole(["admin", "teacher", "student"]);

  if (user.role === "student") {
    const instances = getInstances();
    const svc = getBookingService();
    const terms = getTerms();
    const allSubs = getSubscriptions();
    const accessRulesMap = getAccessRulesMap();

    svc.refreshClasses(
      instances.map((bc) => {
        const style = bc.styleName
          ? DANCE_STYLES.find((s) => s.name === bc.styleName)
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

    const student = STUDENTS.find(
      (s) => s.fullName === user.fullName || s.email === user.email
    );

    const studentId = student?.id ?? "";
    const studentSubs = allSubs.filter(
      (s) => s.studentId === studentId && s.status === "active"
    );
    const studentBookings = svc.getBookingsForStudent(studentId);
    const studentWaitlist = svc.getWaitlistForStudent(studentId);

    const futureInstances = instances
      .filter((c) => isClassInFuture(c.date, c.startTime))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    const classCards: ClassCardData[] = futureInstances.map((rawCls) => {
      const style = rawCls.styleName
        ? DANCE_STYLES.find((s) => s.name === rawCls.styleName)
        : null;

      const confirmedForClass = svc.getConfirmedBookingsForClass(rawCls.id);
      const classInfo: ClassInstanceInfo = {
        id: rawCls.id,
        title: rawCls.title,
        classType: rawCls.classType,
        styleName: rawCls.styleName,
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

    return <ClassBrowser classes={classCards} />;
  }

  const templates = getTemplates().map((t) => ({ ...t }));
  const teacherAssignments = getAssignments().map((a) => ({ ...a }));
  const allStyles = DANCE_STYLES.map((s) => ({ id: s.id, name: s.name }));
  const settings = getSettings();
  const nameMap = buildTeacherNameMap();
  const teacherNameMap = Object.fromEntries(nameMap);
  const isDev = process.env.NODE_ENV === "development";

  return (
    <AdminTemplates
      templates={templates}
      allStyles={allStyles}
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
