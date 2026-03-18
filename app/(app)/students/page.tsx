import { requireRole } from "@/lib/auth";
import { getStudents } from "@/lib/services/student-service";
import { getSubscriptions } from "@/lib/services/subscription-service";
import { getWalletTransactions } from "@/lib/services/wallet-service";
import { BOOKINGS, PENALTIES } from "@/lib/mock-data";
import { AdminStudents } from "@/components/students/admin-students";

export default async function StudentsPage() {
  await requireRole(["admin"]);

  const [students, subscriptions, walletTransactions] = await Promise.all([
    getStudents(),
    getSubscriptions(),
    getWalletTransactions(),
  ]);

  return (
    <AdminStudents
      students={students}
      subscriptions={subscriptions}
      walletTransactions={walletTransactions}
      bookings={BOOKINGS}
      penalties={PENALTIES}
    />
  );
}
