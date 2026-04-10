import { requireRole } from "@/lib/auth";
import {
  cachedGetProducts,
  cachedGetAllSubs,
  cachedGetAllStudents,
} from "@/lib/server/cached-queries";
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
  const _t0 = performance.now();
  await requireRole(["admin"]);
  await ensureOperationalDataHydrated();
  const _tHydrate = performance.now();

  const [products, subscriptions, students] = await Promise.all([
    cachedGetProducts(),
    cachedGetAllSubs(),
    cachedGetAllStudents(),
  ]);
  const _tDb = performance.now();

  const danceStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));

  const scopeMap: Record<string, { styles: string; levels: string }> = {};
  for (const p of products) {
    scopeMap[p.id] = describeProductScope(p);
  }

  const studentNameMap: Record<string, string> = {};
  for (const s of students) {
    studentNameMap[s.id] = s.fullName;
  }

  const _tEnd = performance.now();
  console.info(`[perf /products] hydrate=${(_tHydrate-_t0).toFixed(0)}ms db=${(_tDb-_tHydrate).toFixed(0)}ms enrich=${(_tEnd-_tDb).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

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
