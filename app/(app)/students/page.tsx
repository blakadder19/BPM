import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getStudents } from "@/lib/services/student-store";
import { SUBSCRIPTIONS, WALLET_TRANSACTIONS } from "@/lib/mock-data";
import { AdminStudents } from "@/components/students/admin-students";

export default async function StudentsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const students = getStudents().map((s) => ({ ...s }));

  return (
    <AdminStudents
      students={students}
      subscriptions={SUBSCRIPTIONS}
      walletTransactions={WALLET_TRANSACTIONS}
    />
  );
}
