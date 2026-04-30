import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
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
 *
 * Mode-aware: when the structured access mode overrides the meaning of
 * styles/levels (e.g. social_only ignores both), the summary reflects
 * the effective rule rather than the generic style/level lists.
 */
function describeProductScope(p: MockProduct): { styles: string; levels: string } {
  if (p.styleAccessMode === "social_only") {
    return { styles: "Socials only", levels: "—" };
  }

  const styles = p.styleAccessMode === "all"
    ? "All styles"
    : p.allowedStyleNames?.length
      ? p.allowedStyleNames.join(", ")
      : p.styleName ?? "All styles";
  const levels = p.allowedLevels?.length
    ? p.allowedLevels.join(", ")
    : "All levels";
  return { styles, levels };
}

export default async function ProductsPage() {
  const _t0 = performance.now();
  await requirePermission("products:view");
  await ensureOperationalDataHydrated();
  const _tHydrate = performance.now();

  const [products, subscriptions, students, access] = await Promise.all([
    cachedGetProducts(),
    cachedGetAllSubs(),
    cachedGetAllStudents(),
    getStaffAccess(),
  ]);

  const permissions = {
    canCreate: hasPermission(access, "products:create"),
    canEdit: hasPermission(access, "products:edit"),
    canArchive: hasPermission(access, "products:archive"),
    canDelete: hasPermission(access, "products:delete"),
  };
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
  if (process.env.NODE_ENV === "development") console.info(`[perf /products] hydrate=${(_tHydrate-_t0).toFixed(0)}ms db=${(_tDb-_tHydrate).toFixed(0)}ms enrich=${(_tEnd-_tDb).toFixed(0)}ms total=${(_tEnd-_t0).toFixed(0)}ms`);

  return (
    <AdminProducts
      products={products}
      subscriptions={subscriptions}
      studentNameMap={studentNameMap}
      danceStyles={danceStyles}
      scopeMap={scopeMap}
      permissions={permissions}
    />
  );
}
