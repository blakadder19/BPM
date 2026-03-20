import { requireRole } from "@/lib/auth";
import {
  getStudentRepo,
  getSubscriptionRepo,
  getProductRepo,
  getTermRepo,
  getBookingRepo,
  getPenaltyRepo,
} from "@/lib/repositories";
import { getWalletTransactions } from "@/lib/services/wallet-service";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { AdminStudents } from "@/components/students/admin-students";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  await requireRole(["admin"]);
  const params = searchParams ? await searchParams : {};

  await ensureOperationalDataHydrated();

  const [students, subscriptions, walletTransactions, products, terms] = await Promise.all([
    getStudentRepo().getAll(),
    getSubscriptionRepo().getAll(),
    getWalletTransactions(),
    getProductRepo().getAll(),
    getTermRepo().getAll(),
  ]);

  const bookingSvc = getBookingRepo().getService();
  const penaltySvc = getPenaltyRepo().getService();
  const bookings = bookingSvc.getAllBookings().map((b) => {
    const cls = bookingSvc.getClass(b.bookableClassId);
    return {
      id: b.id,
      bookableClassId: b.bookableClassId,
      studentId: b.studentId,
      studentName: b.studentName,
      classTitle: cls?.title ?? "Unknown",
      date: cls?.date ?? "",
      startTime: cls?.startTime ?? "",
      danceRole: b.danceRole,
      status: b.status,
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

  return (
    <AdminStudents
      students={students}
      subscriptions={subscriptions}
      terms={terms}
      products={products}
      walletTransactions={walletTransactions}
      bookings={bookings}
      penalties={penalties}
      initialSearch={params.search ?? ""}
    />
  );
}
