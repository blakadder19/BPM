import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getBookingRepo,
  getAttendanceRepo,
  getSubscriptionRepo,
  getStudentRepo,
} from "@/lib/repositories";
import { getInstances } from "@/lib/services/schedule-store";
import { isClassInFuture } from "@/lib/domain/datetime";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { DANCE_STYLES } from "@/lib/mock-data";
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

  const allBookings = svc.getAllBookings();
  const allWaitlist = svc.getAllWaitlist();

  const instanceMap = new Map(instances.map((i) => [i.id, i]));

  function enrichBooking(b: (typeof allBookings)[number]): BookingView {
    const cls = svc.getClass(b.bookableClassId);
    const raw = instanceMap.get(b.bookableClassId);
    const activeForClass = allBookings.filter(
      (x) =>
        x.bookableClassId === b.bookableClassId &&
        (x.status === "confirmed" || x.status === "checked_in")
    );
    const waitlistForClass = allWaitlist.filter(
      (w) =>
        w.bookableClassId === b.bookableClassId && w.status === "waiting"
    );
    return {
      id: b.id,
      studentName: b.studentName,
      studentId: b.studentId,
      classTitle: cls?.title ?? "Unknown",
      classId: b.bookableClassId,
      date: cls?.date ?? "",
      startTime: cls?.startTime ?? "",
      endTime: cls?.endTime ?? "",
      danceRole: b.danceRole,
      status: b.status,
      source: b.source ?? null,
      subscriptionName: b.subscriptionName ?? null,
      adminNote: b.adminNote ?? null,
      bookedAt: b.bookedAt,
      styleName: cls?.styleName ?? null,
      level: raw?.level ?? null,
      location: cls?.location ?? null,
      classType: cls?.classType ?? null,
      maxCapacity: cls?.maxCapacity ?? null,
      bookedCount: activeForClass.length,
      leaderCap: cls?.leaderCap ?? null,
      followerCap: cls?.followerCap ?? null,
      leaderCount: activeForClass.filter((x) => x.danceRole === "leader").length,
      followerCount: activeForClass.filter((x) => x.danceRole === "follower").length,
      waitlistCount: waitlistForClass.length,
      checkInToken: b.checkInToken ?? null,
    };
  }

  if (user.role === "student") {
    const attSvc = getAttendanceRepo().getService();
    const mine = allBookings
      .filter((b) => b.studentId === user.id)
      .map(enrichBooking)
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
      .filter((w) => isClassInFuture(w.date, w.startTime))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    return <StudentBookings bookings={mine} waitlistEntries={myWaitlist} />;
  }

  const enriched = allBookings.map(enrichBooking);

  const allStudents = await getStudentRepo().getAll();
  const studentOptions = allStudents.filter((s) => s.isActive).map((s) => ({
    id: s.id,
    fullName: s.fullName,
  }));

  const classInstanceOptions = instances
    .filter(
      (c) =>
        (c.status === "open" || c.status === "scheduled") &&
        isClassInFuture(c.date, c.startTime)
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((c) => {
      const style = c.styleName
        ? DANCE_STYLES.find((s) => s.name === c.styleName)
        : null;
      const activeForClass = allBookings.filter(
        (b) =>
          b.bookableClassId === c.id &&
          (b.status === "confirmed" || b.status === "checked_in")
      );
      return {
        id: c.id,
        title: c.title,
        date: c.date,
        startTime: c.startTime,
        endTime: c.endTime,
        styleName: c.styleName,
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

  const allSubs = await getSubscriptionRepo().getAll();
  const subscriptionsByStudent: Record<
    string,
    {
      id: string;
      productName: string;
      productType: string;
      status: string;
      remainingCredits: number | null;
      classesPerTerm: number | null;
      classesUsed: number;
      termId: string | null;
      validFrom: string;
      validUntil: string | null;
    }[]
  > = {};
  for (const sub of allSubs) {
    if (sub.status !== "active") continue;
    if (!subscriptionsByStudent[sub.studentId]) {
      subscriptionsByStudent[sub.studentId] = [];
    }
    subscriptionsByStudent[sub.studentId].push({
      id: sub.id,
      productName: sub.productName,
      productType: sub.productType,
      status: sub.status,
      remainingCredits: sub.remainingCredits,
      classesPerTerm: sub.classesPerTerm,
      classesUsed: sub.classesUsed,
      termId: sub.termId,
      validFrom: sub.validFrom,
      validUntil: sub.validUntil,
    });
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <AdminBookings
      bookings={enriched}
      students={studentOptions}
      classInstances={classInstanceOptions}
      waitlistEntries={waitlistEntryViews}
      subscriptionsByStudent={subscriptionsByStudent}
      initialSearch={params.classTitle ?? ""}
      isDev={isDev}
    />
  );
}
