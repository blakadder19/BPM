import { requireRole } from "@/lib/auth";
import { getStudents } from "@/lib/services/student-service";
import { getSubscriptions } from "@/lib/services/subscription-service";
import { getWalletTransactions } from "@/lib/services/wallet-service";
import { getBookingService } from "@/lib/services/booking-store";
import { getPenaltyService } from "@/lib/services/penalty-store";
import { getProducts } from "@/lib/services/product-store";
import { getTerms } from "@/lib/services/term-store";
import { AdminStudents } from "@/components/students/admin-students";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  await requireRole(["admin"]);
  const params = searchParams ? await searchParams : {};

  const [students, subscriptions, walletTransactions] = await Promise.all([
    getStudents(),
    getSubscriptions(),
    getWalletTransactions(),
  ]);

  const products = getProducts();
  const terms = getTerms();

  const bookingSvc = getBookingService();
  const penaltySvc = getPenaltyService();
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
