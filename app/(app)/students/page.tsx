import { requireRole } from "@/lib/auth";
import {
  getStudentRepo,
  getSubscriptionRepo,
  getProductRepo,
  getTermRepo,
  getBookingRepo,
  getPenaltyRepo,
  getAttendanceRepo,
  getDanceStyleRepo,
} from "@/lib/repositories";
import { getWalletTransactions } from "@/lib/services/wallet-service";
import { resolveStudentVisibleStatus } from "@/lib/domain/student-visible-status";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getInstances } from "@/lib/services/schedule-store";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { lazyExpireSubscriptions } from "@/lib/actions/term-lifecycle";
import { AdminStudents } from "@/components/students/admin-students";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  await requireRole(["admin"]);
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();
  await lazyExpireSubscriptions();

  const [students, subscriptions, walletTransactions, products, terms, danceStyles] = await Promise.all([
    getStudentRepo().getAll(),
    getSubscriptionRepo().getAll(),
    getWalletTransactions(),
    getProductRepo().getAll(),
    getTermRepo().getAll(),
    getDanceStyleRepo().getAll(),
  ]);

  const bookingSvc = getBookingRepo().getService();

  const instances = getInstances();
  const allDanceStyles = getDanceStyles();
  bookingSvc.refreshClasses(
    instances.map((bc) => {
      const style = bc.styleName
        ? allDanceStyles.find((s) => s.name === bc.styleName)
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
      attendanceRecords={attendanceRecords}
      initialSearch={params.search ?? ""}
    />
  );
}
