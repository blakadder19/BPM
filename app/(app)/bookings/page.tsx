import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getBookingRepo,
  getAttendanceRepo,
  getSubscriptionRepo,
  getStudentRepo,
  getProductRepo,
  getCocRepo,
} from "@/lib/repositories";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { getInstances } from "@/lib/services/schedule-store";
import { isClassEnded, getTodayStr } from "@/lib/domain/datetime";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { StudentBookings } from "@/components/booking/student-bookings";
import { AdminBookings } from "@/components/booking/admin-bookings";

export interface StudentWaitlistView {
  id: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  position: number;
  danceRole: string | null;
}

export interface BookingView {
  id: string;
  studentName: string;
  studentId: string;
  classTitle: string;
  classId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  danceRole: string | null;
  status: string;
  source: string | null;
  subscriptionName: string | null;
  adminNote: string | null;
  bookedAt: string;
  styleName: string | null;
  level: string | null;
  location: string | null;
  classType: string | null;
  maxCapacity: number | null;
  bookedCount: number;
  leaderCap: number | null;
  followerCap: number | null;
  leaderCount: number;
  followerCount: number;
  waitlistCount: number;
  checkInToken: string | null;
  isOrphaned: boolean;
  isAcademyCancelled: boolean;
  creditReturned: boolean;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ classTitle?: string; date?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  await ensureOperationalDataHydrated();

  const params = searchParams ? await searchParams : {};
  const svc = getBookingRepo().getService();

  const instances = getInstances();
  const danceStyles = getDanceStyles();
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

  const allBookings = svc.getAllBookings();
  const allWaitlist = svc.getAllWaitlist();

  const instanceMap = new Map(instances.map((i) => [i.id, i]));

  function enrichBooking(b: (typeof allBookings)[number]): BookingView | null {
    const cls = svc.getClass(b.bookableClassId);
    const raw = instanceMap.get(b.bookableClassId);
    const classDeleted = !cls && !raw;
    const isAcademyCancelled = b.adminNote === "academy_cancelled";
    const classCancelled = raw?.status === "cancelled";

    const resolvedDate = cls?.date ?? raw?.date ?? "";

    // Drop bookings whose class data is completely gone — no title, no date
    if (classDeleted && !resolvedDate) return null;

    const activeForClass = allBookings.filter(
      (x) =>
        x.bookableClassId === b.bookableClassId &&
        (x.status === "confirmed" || x.status === "checked_in")
    );
    const waitlistForClass = allWaitlist.filter(
      (w) =>
        w.bookableClassId === b.bookableClassId && w.status === "waiting"
    );

    const title = cls?.title ?? raw?.title ?? "Unknown";

    return {
      id: b.id,
      studentName: b.studentName,
      studentId: b.studentId,
      classTitle: title,
      classId: b.bookableClassId,
      date: resolvedDate,
      startTime: cls?.startTime ?? raw?.startTime ?? "",
      endTime: cls?.endTime ?? raw?.endTime ?? "",
      danceRole: b.danceRole,
      status: b.status,
      source: b.source ?? null,
      subscriptionName: b.subscriptionName ?? null,
      adminNote: b.adminNote ?? null,
      bookedAt: b.bookedAt,
      styleName: cls?.styleName ?? raw?.styleName ?? null,
      level: raw?.level ?? null,
      location: cls?.location ?? raw?.location ?? null,
      classType: cls?.classType ?? raw?.classType ?? null,
      maxCapacity: cls?.maxCapacity ?? null,
      bookedCount: activeForClass.length,
      leaderCap: cls?.leaderCap ?? null,
      followerCap: cls?.followerCap ?? null,
      leaderCount: activeForClass.filter((x) => x.danceRole === "leader").length,
      followerCount: activeForClass.filter((x) => x.danceRole === "follower").length,
      waitlistCount: waitlistForClass.length,
      checkInToken: b.checkInToken ?? null,
      isOrphaned: classDeleted,
      isAcademyCancelled: isAcademyCancelled || classCancelled,
      creditReturned: isAcademyCancelled && !!b.subscriptionId,
    };
  }

  if (user.role === "student") {
    const cocDone = await getCocRepo().hasAcceptedVersion(user.id, CURRENT_CODE_OF_CONDUCT.version);
    if (!cocDone) redirect("/onboarding");

    const attSvc = getAttendanceRepo().getService();
    const mine = allBookings
      .filter((b) => b.studentId === user.id)
      .map(enrichBooking)
      .filter((b): b is BookingView => b !== null)
      .map((b) => {
        const attRecord = attSvc.getRecord(b.classId ?? "", b.studentId);
        return {
          ...b,
          status: resolveStudentVisibleStatus(b.status, attRecord?.status),
        };
      });

    const myWaitlist = allWaitlist
      .filter((w) => w.studentId === user.id && w.status === "waiting")
      .map((w) => {
        const cls = svc.getClass(w.bookableClassId);
        return {
          id: w.id,
          classTitle: cls?.title ?? "Unknown",
          date: cls?.date ?? "",
          startTime: cls?.startTime ?? "",
          endTime: cls?.endTime ?? "",
          location: cls?.location ?? "",
          position: w.position,
          danceRole: w.danceRole,
        };
      })
      .filter((w) => !isClassEnded(w.date, w.endTime))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    return <StudentBookings bookings={mine} waitlistEntries={myWaitlist} />;
  }

  const enriched = allBookings.map(enrichBooking).filter((b): b is BookingView => b !== null);

  const [allStudents, allSubs, allProducts] = await Promise.all([
    getStudentRepo().getAll(),
    getSubscriptionRepo().getAll(),
    getProductRepo().getAll(),
  ]);

  const studentOptions = allStudents.filter((s) => s.isActive).map((s) => ({
    id: s.id,
    fullName: s.fullName,
  }));

  const activeBookingsByClass = new Map<string, typeof allBookings>();
  for (const b of allBookings) {
    if (b.status !== "confirmed" && b.status !== "checked_in") continue;
    let list = activeBookingsByClass.get(b.bookableClassId);
    if (!list) {
      list = [];
      activeBookingsByClass.set(b.bookableClassId, list);
    }
    list.push(b);
  }

  const classInstanceOptions = instances
    .filter(
      (c) =>
        (c.status === "open" || c.status === "scheduled") &&
        !isClassEnded(c.date, c.endTime)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((c) => {
      const style = c.styleName
        ? danceStyles.find((s) => s.name === c.styleName)
        : null;
      const activeForClass = activeBookingsByClass.get(c.id) ?? [];
      return {
        id: c.id,
        title: c.title,
        date: c.date,
        startTime: c.startTime,
        endTime: c.endTime,
        styleName: c.styleName,
        styleId: c.styleId ?? (style?.id ?? null),
        classType: c.classType,
        level: c.level ?? null,
        location: c.location,
        status: c.status,
        maxCapacity: c.maxCapacity,
        bookedCount: activeForClass.length,
        leaderCap: c.leaderCap,
        followerCap: c.followerCap,
        leaderCount: activeForClass.filter((b) => b.danceRole === "leader").length,
        followerCount: activeForClass.filter((b) => b.danceRole === "follower").length,
        danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
      };
    });

  const waitlistEntryViews = allWaitlist
    .filter((w) => w.status === "waiting")
    .map((w) => ({
      id: w.id,
      classId: w.bookableClassId,
      studentName: w.studentName,
      danceRole: w.danceRole,
      position: w.position,
      joinedAt: w.joinedAt,
    }));

  const subscriptionsByStudent: Record<
    string,
    {
      id: string;
      productId: string;
      productName: string;
      productType: string;
      status: string;
      remainingCredits: number | null;
      classesPerTerm: number | null;
      classesUsed: number;
      termId: string | null;
      validFrom: string;
      validUntil: string | null;
      selectedStyleId: string | null;
      selectedStyleIds: string[] | null;
    }[]
  > = {};
  for (const sub of allSubs) {
    if (sub.status !== "active") continue;
    if (!subscriptionsByStudent[sub.studentId]) {
      subscriptionsByStudent[sub.studentId] = [];
    }
    subscriptionsByStudent[sub.studentId].push({
      id: sub.id,
      productId: sub.productId,
      productName: sub.productName,
      productType: sub.productType,
      status: sub.status,
      remainingCredits: sub.remainingCredits,
      classesPerTerm: sub.classesPerTerm,
      classesUsed: sub.classesUsed,
      termId: sub.termId,
      validFrom: sub.validFrom,
      validUntil: sub.validUntil,
      selectedStyleId: sub.selectedStyleId,
      selectedStyleIds: sub.selectedStyleIds,
    });
  }

  const isDev = process.env.NODE_ENV === "development";

  const dynamicRulesMap = buildDynamicAccessRulesMap(allProducts, danceStyles);
  const serializedAccessRules: Record<string, import("@/config/product-access").ProductAccessRule> = {};
  for (const [k, v] of dynamicRulesMap) {
    serializedAccessRules[k] = v;
  }

  return (
    <AdminBookings
      bookings={enriched}
      students={studentOptions}
      classInstances={classInstanceOptions}
      waitlistEntries={waitlistEntryViews}
      subscriptionsByStudent={subscriptionsByStudent}
      accessRulesMap={serializedAccessRules}
      initialSearch={params.classTitle ?? ""}
      isDev={isDev}
      today={getTodayStr()}
    />
  );
}
