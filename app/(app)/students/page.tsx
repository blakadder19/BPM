import { requireRole } from "@/lib/auth";
import { getStudents } from "@/lib/services/student-service";
import { getSubscriptions } from "@/lib/services/subscription-service";
import { getWalletTransactions } from "@/lib/services/wallet-service";
import { getProducts } from "@/lib/services/product-store";
import { getTerms } from "@/lib/services/term-store";
import { BOOKINGS, PENALTIES } from "@/lib/mock-data";
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

  return (
    <AdminStudents
      students={students}
      subscriptions={subscriptions}
      terms={terms}
      products={products}
      walletTransactions={walletTransactions}
      bookings={BOOKINGS}
      penalties={PENALTIES}
      initialSearch={params.search ?? ""}
    />
  );
}
