import { requireRole } from "@/lib/auth";
import { getProductRepo, getSubscriptionRepo, getStudentRepo } from "@/lib/repositories";
import { AdminProducts } from "@/components/products/admin-products";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getDanceStyles } from "@/lib/services/dance-style-store";

export default async function ProductsPage() {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();

  const [products, subscriptions, students] = await Promise.all([
    getProductRepo().getAll(),
    getSubscriptionRepo().getAll(),
    getStudentRepo().getAll(),
  ]);

  const danceStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));

  const studentNameMap: Record<string, string> = {};
  for (const s of students) {
    studentNameMap[s.id] = s.fullName;
  }

  return (
    <AdminProducts
      products={products}
      subscriptions={subscriptions}
      studentNameMap={studentNameMap}
      danceStyles={danceStyles}
    />
  );
}
