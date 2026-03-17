import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getProducts } from "@/lib/services/product-store";
import { AdminProducts } from "@/components/products/admin-products";

export default async function ProductsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const products = getProducts().map((p) => ({ ...p }));

  return <AdminProducts products={products} />;
}
