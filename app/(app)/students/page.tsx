import {
  getStaffAccess,
  hasPermission,
  requireAnyPermission,
} from "@/lib/staff-permissions";
import {
  getBookingRepo,
  getPenaltyRepo,
  getAttendanceRepo,
  getSpecialEventRepo,
  getAffiliationRepo,
} from "@/lib/repositories";
import {
  cachedGetTerms,
  cachedGetProducts,
  cachedGetAllStudents,
  cachedGetAllDanceStyles,
  cachedGetAllSubs,
} from "@/lib/server/cached-queries";
import { getWalletTransactions } from "@/lib/services/wallet-service";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getInstances } from "@/lib/services/schedule-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { lazyExpireSubscriptions } from "@/lib/actions/term-lifecycle";
import { AdminStudents } from "@/components/students/admin-students";
import { getAllRedemptionsForYear, type BirthdayRedemption } from "@/lib/services/birthday-benefit-store";
import type { MockEventPurchase } from "@/lib/mock-data";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const _t0 = performance.now();
  // Front-desk and teacher roles can also reach this page through their
  // `students:view_limited` permission. The detail panel independently
  // gates finance-sensitive sections via `students:view_finance`.
  await requireAnyPermission(["students:view", "students:view_limited"]);
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();
  lazyExpireSubscriptions().catch(() => {});
  const _tHydrate = performance.now();

  const year = new Date().getFullYear();
  const [students, walletTransactions, products, terms, danceStyles, birthdayMap, subscriptions, affiliations, access] = await Promise.all([
    cachedGetAllStudents(),
    getWalletTransactions(),
    cachedGetProducts(),
    cachedGetTerms(),
    cachedGetAllDanceStyles(),
    getAllRedemptionsForYear(year),
    cachedGetAllSubs(),
    getAffiliationRepo().getAll(),
    getStaffAccess(),
  ]);

  const permissions = {
    canCreate: hasPermission(access, "students:create"),
    canEdit: hasPermission(access, "students:edit"),
    canDelete: hasPermission(access, "students:delete"),
    canViewFinance: hasPermission(access, "students:view_finance"),
    canManageAffiliations: hasPermission(access, "students:manage_affiliations"),
    canRunLifecycle: hasPermission(access, "students:edit"),
  };
  const _tDb = performance.now();

  const bookingSvc = getBookingRepo().getService();

  const instances = getInstances();
  const allDanceStyles = getDanceStyles();
  const styleByName = new Map(allDanceStyles.map((s) => [s.name, s]));
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

  const penaltySvc = getPenaltyRepo().getService();
  const attendanceSvc = getAttendanceRepo().getService();
  const bookings = bookingSvc.getAllBookings().map((b) => {
    const cls = bookingSvc.getClass(b.bookableClassId);
    const attRecord = attendanceSvc.getRecord(b.bookableClassId, b.studentId);
    return {
      id: b.id,
      bookableClassId: b.bookableClassId,
      studentId: b.studentId,
      studentName: b.studentName,
      classTitle: cls?.title ?? "Unknown",
      date: cls?.date ?? "",
      startTime: cls?.startTime ?? "",
      danceRole: b.danceRole,
      status: resolveStudentVisibleStatus(b.status, attRecord?.status) as typeof b.status,
      source: b.source,
      subscriptionId: b.subscriptionId,
      subscriptionName: b.subscriptionName,
      adminNote: b.adminNote,
      bookedAt: b.bookedAt,
    };
  });
  const penalties = penaltySvc.getAllPenalties().map((p) => ({
    id: p.id,
    studentId: p.studentId,
    studentName: p.studentName,
    bookingId: p.bookingId,
    bookableClassId: p.bookableClassId,
    classTitle: p.classTitle,
    date: p.classDate,
    reason: p.reason,
    amountCents: p.amountCents,
    resolution: p.resolution,
    createdAt: p.createdAt,
    subscriptionId: p.subscriptionId ?? null,
    creditDeducted: p.creditDeducted ?? false,
    notes: p.notes ?? null,
  }));

  const attendanceRecords = attendanceSvc.getAllRecords().map((a) => ({
    bookableClassId: a.bookableClassId,
    studentId: a.studentId,
    status: a.status,
  }));

  const birthdayRedemptionMap: Record<string, BirthdayRedemption> = {};
  for (const [sid, r] of birthdayMap) {
    birthdayRedemptionMap[sid] = r;
  }
  const birthdayUsedIds = Object.keys(birthdayRedemptionMap);

  let eventPurchases: MockEventPurchase[] = [];
  try {
    const eventRepo = getSpecialEventRepo();
    const events = await eventRepo.getAllEvents();
    eventPurchases = (
      await Promise.all(events.map((e) => eventRepo.getPurchasesByEvent(e.id)))
    ).flat();
  } catch {
    // Event module may not be active
  }

  const _tEnd = performance.now();
  if (process.env.NODE_ENV === "development") console.info(`[perf /students] hydrate=${(_tHydrate-_t0).toFixed(0)}ms db=${(_tDb-_tHydrate).toFixed(0)}ms enrich=${(_tEnd-_tDb).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

  return (
    <AdminStudents
      students={students}
      subscriptions={subscriptions}
      terms={terms}
      products={products}
      danceStyles={danceStyles}
      walletTransactions={walletTransactions}
      bookings={bookings}
      penalties={penalties}
      eventPurchases={eventPurchases}
      attendanceRecords={attendanceRecords}
      affiliations={affiliations.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        affiliationType: a.affiliationType,
        verificationStatus: a.verificationStatus,
        verifiedAt: a.verifiedAt,
        verifiedBy: a.verifiedBy,
        validFrom: a.validFrom,
        validUntil: a.validUntil,
        notes: a.notes,
        createdAt: a.createdAt,
      }))}
      initialSearch={params.search ?? ""}
      birthdayUsedStudentIds={birthdayUsedIds}
      birthdayRedemptions={birthdayRedemptionMap}
      permissions={permissions}
    />
  );
}
