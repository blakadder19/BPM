import { requireRole } from "@/lib/auth";
import { getProductRepo, getSubscriptionRepo } from "@/lib/repositories";
import { AdminProducts } from "@/components/products/admin-products";

export default async function ProductsPage() {
  await requireRole(["admin"]);

  const [products, subscriptions] = await Promise.all([
    getProductRepo().getAll(),
    getSubscriptionRepo().getAll(),
  ]);

  return (
    <AdminProducts
      products={products}
      subscriptions={subscriptions}
    />
  );
}
