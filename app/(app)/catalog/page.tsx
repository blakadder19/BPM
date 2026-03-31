import { requireRole } from "@/lib/auth";
import { getProductRepo, getTermRepo, getSubscriptionRepo } from "@/lib/repositories";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getCurrentTerm, getNextTerm } from "@/lib/domain/term-rules";
import { getTodayStr } from "@/lib/domain/datetime";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getAccessRule } from "@/config/product-access";
import { StudentCatalog, type CatalogProduct, type StyleOption, type StyleSelectionMode } from "@/components/catalog/student-catalog";
import type { MockProduct } from "@/lib/mock-data";

function describeStyles(p: MockProduct): string {
  if (p.allowedStyleNames?.length) return p.allowedStyleNames.join(", ");
  return p.styleName ?? "All styles";
}

function describeLevels(p: MockProduct): string {
  if (p.allowedLevels?.length) return p.allowedLevels.join(", ");
  return "All levels";
}

function resolveStyleSelection(
  p: MockProduct,
  allStyles: { id: string; name: string }[]
): { mode: StyleSelectionMode; selectable: StyleOption[]; pickCount: number } {
  const rule = getAccessRule(p.id);
  if (!rule) return { mode: "none", selectable: [], pickCount: 0 };

  const sa = rule.styleAccess;
  if (sa.type === "selected_style" && sa.allowedStyleIds?.length) {
    const allowed = new Set(sa.allowedStyleIds);
    return {
      mode: "pick_one",
      selectable: allStyles.filter((s) => allowed.has(s.id)),
      pickCount: 1,
    };
  }
  if (sa.type === "course_group") {
    const pool = new Set(sa.poolStyleIds);
    return {
      mode: "pick_many",
      selectable: allStyles.filter((s) => pool.has(s.id)),
      pickCount: sa.pickCount,
    };
  }
  return { mode: "none", selectable: [], pickCount: 0 };
}

export default async function CatalogPage() {
  const user = await requireRole(["student"]);

  await ensureOperationalDataHydrated();

  const [products, terms, allSubs] = await Promise.all([
    getProductRepo().getAll(),
    getTermRepo().getAll(),
    getSubscriptionRepo().getAll(),
  ]);

  const danceStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));
  const todayStr = getTodayStr();
  const currentTerm = getCurrentTerm(terms, todayStr);
  const nextTerm = getNextTerm(terms, todayStr);

  const activeSubs = allSubs.filter(
    (s) => s.studentId === user.id && s.status === "active"
  );
  const activeProductIds = new Set(activeSubs.map((s) => s.productId));

  const catalog: CatalogProduct[] = products
    .filter((p) => p.isActive)
    .map((p) => {
      let termName: string | null = null;
      if (p.termBound) {
        if (currentTerm?.name) termName = currentTerm.name;
        else if (nextTerm?.name) termName = `Next: ${nextTerm.name}`;
      }

      const { mode, selectable, pickCount } = resolveStyleSelection(p, danceStyles);

      return {
        id: p.id,
        name: p.name,
        productType: p.productType,
        description: p.description,
        longDescription: p.longDescription,
        priceCents: p.priceCents,
        styles: describeStyles(p),
        levels: describeLevels(p),
        classesPerTerm: p.classesPerTerm,
        totalCredits: p.totalCredits,
        validityDescription: p.validityDescription,
        benefits: p.benefits,
        termBound: p.termBound,
        recurring: p.recurring,
        spanTerms: p.spanTerms,
        termName,
        alreadyActive: activeProductIds.has(p.id),
        styleSelectionMode: mode,
        selectableStyles: selectable,
        pickCount,
      };
    })
    .sort((a, b) => a.priceCents - b.priceCents);

  return <StudentCatalog products={catalog} />;
}
