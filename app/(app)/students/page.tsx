import { requireRole } from "@/lib/auth";
import { getStudents } from "@/lib/services/student-service";
import { SUBSCRIPTIONS, WALLET_TRANSACTIONS } from "@/lib/mock-data";
import { AdminStudents } from "@/components/students/admin-students";

export default async function StudentsPage() {
  await requireRole(["admin"]);

  const students = await getStudents();

  return (
    <AdminStudents
      students={students}
      subscriptions={SUBSCRIPTIONS}
      walletTransactions={WALLET_TRANSACTIONS}
    />
  );
}
