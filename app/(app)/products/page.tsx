import { requireRole } from "@/lib/auth";
import { getProducts } from "@/lib/services/product-service";
import { SUBSCRIPTIONS } from "@/lib/mock-data";
import { AdminProducts } from "@/components/products/admin-products";

export default async function ProductsPage() {
  await requireRole(["admin"]);

  const products = await getProducts();

  return (
    <AdminProducts
      products={products}
      subscriptions={SUBSCRIPTIONS}
    />
  );
}
