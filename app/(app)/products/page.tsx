import { requireRole } from "@/lib/auth";
import { getProductRepo, getSubscriptionRepo, getStudentRepo } from "@/lib/repositories";
import { AdminProducts } from "@/components/products/admin-products";

export default async function ProductsPage() {
  await requireRole(["admin"]);

  const [products, subscriptions, students] = await Promise.all([
    getProductRepo().getAll(),
    getSubscriptionRepo().getAll(),
    getStudentRepo().getAll(),
  ]);

  const studentNameMap: Record<string, string> = {};
  for (const s of students) {
    studentNameMap[s.id] = s.fullName;
  }

  return (
    <AdminProducts
      products={products}
      subscriptions={subscriptions}
      studentNameMap={studentNameMap}
    />
  );
}
