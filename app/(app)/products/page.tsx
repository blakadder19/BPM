import { requireRole } from "@/lib/auth";
import { getProductRepo, getSubscriptionRepo, getStudentRepo } from "@/lib/repositories";
import { AdminProducts } from "@/components/products/admin-products";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import type { MockProduct } from "@/lib/mock-data";

/**
 * Derive scope description from saved product fields (single source of truth).
 */
function describeProductScope(p: MockProduct): { styles: string; levels: string } {
  const styles = p.allowedStyleNames?.length
    ? p.allowedStyleNames.join(", ")
    : p.styleName ?? "All styles";
  const levels = p.allowedLevels?.length
    ? p.allowedLevels.join(", ")
    : "All levels";
  return { styles, levels };
}

export default async function ProductsPage() {
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();

  const [products, subscriptions, students] = await Promise.all([
    getProductRepo().getAll(),
    getSubscriptionRepo().getAll(),
    getStudentRepo().getAll(),
  ]);

  const danceStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));

  const scopeMap: Record<string, { styles: string; levels: string }> = {};
  for (const p of products) {
    scopeMap[p.id] = describeProductScope(p);
  }

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
      scopeMap={scopeMap}
    />
  );
}
