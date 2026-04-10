import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import {
  getBookingRepo,
  getAttendanceRepo,
} from "@/lib/repositories";
import {
  cachedCocCheck,
  cachedGetAllStudents,
  cachedGetAllSubs,
  cachedGetProducts,
} from "@/lib/server/cached-queries";
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

export interface AdminBookingsFilterParams {
  q?: string;
  status?: string;
  role?: string;
  source?: string;
  type?: string;
  location?: string;
  upcoming?: string;
  waitlist?: string;
  page?: string;
  classTitle?: string;
  date?: string;
}

const ADMIN_PAGE_SIZE = 50;

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<AdminBookingsFilterParams>;
}) {
  const _t0 = performance.now();
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const _tAuth = performance.now();

  await ensureOperationalDataHydrated();
  const _tHydrate = performance.now();

  const params = searchParams ? await searchParams : {};
  const svc = getBookingRepo().getService();

  const instances = getInstances();
  const danceStyles = getDanceStyles();
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

  const allBookings = svc.getAllBookings();
  const allWaitlist = svc.getAllWaitlist();

  const instanceMap = new Map(instances.map((i) => [i.id, i]));

  // Pre-compute per-class stats to avoid O(n²) scanning inside enrichBooking
  const activeByClass = new Map<string, { total: number; leaders: number; followers: number }>();
  for (const x of allBookings) {
    if (x.status !== "confirmed" && x.status !== "checked_in") continue;
    let entry = activeByClass.get(x.bookableClassId);
    if (!entry) { entry = { total: 0, leaders: 0, followers: 0 }; activeByClass.set(x.bookableClassId, entry); }
    entry.total++;
    if (x.danceRole === "leader") entry.leaders++;
    else if (x.danceRole === "follower") entry.followers++;
  }
  const waitlistByClass = new Map<string, number>();
  for (const w of allWaitlist) {
    if (w.status !== "waiting") continue;
    waitlistByClass.set(w.bookableClassId, (waitlistByClass.get(w.bookableClassId) ?? 0) + 1);
  }

  function enrichBooking(b: (typeof allBookings)[number]): BookingView | null {
    const cls = svc.getClass(b.bookableClassId);
    const raw = instanceMap.get(b.bookableClassId);
    const classDeleted = !cls && !raw;
    const isAcademyCancelled = b.adminNote === "academy_cancelled";
    const classCancelled = raw?.status === "cancelled";

    const resolvedDate = cls?.date ?? raw?.date ?? b.bookedAt?.split("T")[0] ?? "";

    if (classDeleted && !resolvedDate) return null;

    const stats = activeByClass.get(b.bookableClassId);
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
      bookedCount: stats?.total ?? 0,
      leaderCap: cls?.leaderCap ?? null,
      followerCap: cls?.followerCap ?? null,
      leaderCount: stats?.leaders ?? 0,
      followerCount: stats?.followers ?? 0,
      waitlistCount: waitlistByClass.get(b.bookableClassId) ?? 0,
      checkInToken: b.checkInToken ?? null,
      isOrphaned: classDeleted,
      isAcademyCancelled: isAcademyCancelled || classCancelled,
      creditReturned: isAcademyCancelled && !!b.subscriptionId,
    };
  }

  if (user.role === "student") {
    const cocDone = await cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version);
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

    const _tEnd = performance.now();
    console.info(`[perf /bookings] auth=${(_tAuth-_t0).toFixed(0)}ms hydrate=${(_tHydrate-_tAuth).toFixed(0)}ms enrich+render=${(_tEnd-_tHydrate).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);
    return <StudentBookings bookings={mine} waitlistEntries={myWaitlist} />;
  }

  const enriched = allBookings.map(enrichBooking).filter((b): b is BookingView => b !== null);

  // ── Server-side filtering & pagination ──
  const today = getTodayStr();
  const filterQ = (params.q ?? params.classTitle ?? "").toLowerCase();
  const filterStatus = params.status ?? "";
  const filterRole = params.role ?? "";
  const filterSource = params.source ?? "";
  const filterType = params.type ?? "";
  const filterLocation = params.location ?? "";
  const upcomingOnly = params.upcoming !== "false";
  const waitlistOnly = params.waitlist === "true";
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const waitlistClassIds = new Set(
    allWaitlist.filter((w) => w.status === "waiting").map((w) => w.bookableClassId)
  );

  const filtered = enriched.filter((b) => {
    if (filterQ && !b.studentName.toLowerCase().includes(filterQ) && !b.classTitle.toLowerCase().includes(filterQ)) return false;
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterRole === "none" && b.danceRole !== null) return false;
    if (filterRole && filterRole !== "none" && b.danceRole !== filterRole) return false;
    if (filterSource && b.source !== filterSource) return false;
    if (filterType && b.classType !== filterType) return false;
    if (filterLocation && b.location !== filterLocation) return false;
    if (upcomingOnly) {
      if (b.date < today) return false;
      if (b.date === today && b.endTime && isClassEnded(b.date, b.endTime)) return false;
    }
    if (waitlistOnly && !waitlistClassIds.has(b.classId ?? "")) return false;
    return true;
  });

  if (upcomingOnly) {
    filtered.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  } else {
    filtered.sort((a, b) => b.date.localeCompare(a.date) || b.bookedAt.localeCompare(a.bookedAt));
  }

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / ADMIN_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageBookings = filtered.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE);

  // Derive filter options from full dataset (not just filtered page)
  const typeOptions = Array.from(new Set(enriched.map((b) => b.classType).filter(Boolean))).map((t) => ({ value: t!, label: t! }));
  const locationOptions = Array.from(new Set(enriched.map((b) => b.location).filter(Boolean))).map((l) => ({ value: l!, label: l! }));

  // ── Supporting data for dialogs ──
  const [allStudents, allSubs, allProducts] = await Promise.all([
    cachedGetAllStudents(),
    cachedGetAllSubs(),
    cachedGetProducts(),
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
      const style = c.styleName ? styleByName.get(c.styleName) : null;
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

  const _tEnd = performance.now();
  console.info(`[perf /bookings admin] auth=${(_tAuth-_t0).toFixed(0)}ms hydrate=${(_tHydrate-_tAuth).toFixed(0)}ms enrich+filter=${(_tEnd-_tHydrate).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

  return (
    <AdminBookings
      bookings={pageBookings}
      students={studentOptions}
      classInstances={classInstanceOptions}
      waitlistEntries={waitlistEntryViews}
      subscriptionsByStudent={subscriptionsByStudent}
      accessRulesMap={serializedAccessRules}
      initialSearch={filterQ}
      isDev={isDev}
      today={today}
      pagination={{
        currentPage: safePage,
        totalPages,
        totalCount,
        pageSize: ADMIN_PAGE_SIZE,
      }}
      serverFilters={{
        status: filterStatus,
        role: filterRole,
        source: filterSource,
        type: filterType,
        location: filterLocation,
        upcomingOnly,
        waitlistOnly,
      }}
      typeOptions={typeOptions}
      locationOptions={locationOptions}
    />
  );
}
