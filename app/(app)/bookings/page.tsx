import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getBookingService } from "@/lib/services/booking-store";
import { getInstances } from "@/lib/services/schedule-store";
import { getSubscriptions } from "@/lib/services/subscription-store";
import { STUDENTS, DANCE_STYLES } from "@/lib/mock-data";
import { StudentBookings } from "@/components/booking/student-bookings";
import { AdminBookings } from "@/components/booking/admin-bookings";

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
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ classTitle?: string; date?: string }>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const params = searchParams ? await searchParams : {};
  const svc = getBookingService();

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
    };
  }

  if (user.role === "student") {
    const mine = allBookings
      .filter((b) => b.studentName === user.fullName)
      .map(enrichBooking);
    return <StudentBookings bookings={mine} />;
  }

  const enriched = allBookings.map(enrichBooking);

  const studentOptions = STUDENTS.filter((s) => s.isActive).map((s) => ({
    id: s.id,
    fullName: s.fullName,
  }));

  const todayStr = new Date().toISOString().slice(0, 10);

  const classInstanceOptions = instances
    .filter(
      (c) =>
        (c.status === "open" || c.status === "scheduled") &&
        c.date >= todayStr
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

  const allSubs = getSubscriptions();
  const subscriptionsByStudent: Record<
    string,
    { id: string; productName: string; status: string; remainingCredits: number | null }[]
  > = {};
  for (const sub of allSubs) {
    if (sub.status !== "active") continue;
    if (!subscriptionsByStudent[sub.studentId]) {
      subscriptionsByStudent[sub.studentId] = [];
    }
    subscriptionsByStudent[sub.studentId].push({
      id: sub.id,
      productName: sub.productName,
      status: sub.status,
      remainingCredits: sub.remainingCredits,
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
