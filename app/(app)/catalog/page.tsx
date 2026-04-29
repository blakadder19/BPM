import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { cachedGetTerms, cachedGetProducts, cachedCocCheck, cachedGetStudentSubs } from "@/lib/server/cached-queries";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getCurrentTerm, getNextTerm, isCurrentTermPurchasable } from "@/lib/domain/term-rules";
import { getTodayStr } from "@/lib/domain/datetime";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getSettings } from "@/lib/services/settings-store";
import { lazyExpireSubscriptions } from "@/lib/actions/term-lifecycle";
import { buildDynamicAccessRulesMap, type ProductAccessRule } from "@/config/product-access";
import { isStripeEnabled } from "@/lib/stripe";
import { previewPricingForStudent } from "@/lib/services/pricing-service";
import { StudentCatalog, type AppliedDiscountSummary, type CatalogProduct, type StyleOption, type StyleSelectionMode, type TermOption } from "@/components/catalog/student-catalog";
import type { MockProduct } from "@/lib/mock-data";

/**
 * Style summary shown in the student-facing catalog.
 *
 * Mode-aware to match admin /products: structured access modes
 * override the meaning of the legacy `allowedStyleNames` / `styleName`
 * fields, so e.g. `social_only` must render "Socials only" and not
 * fall back to "All styles" via the legacy null-list path.
 */
function describeStyles(p: MockProduct): string {
  if (p.styleAccessMode === "social_only") return "Socials only";
  if (p.styleAccessMode === "all") return "All styles";
  if (p.allowedStyleNames?.length) return p.allowedStyleNames.join(", ");
  return p.styleName ?? "All styles";
}

function describeLevels(p: MockProduct): string {
  // Levels are meaningless for socials — match the admin detail panel
  // and don't display the misleading "All levels" fallback there.
  if (p.styleAccessMode === "social_only") return "—";
  if (p.allowedLevels?.length) return p.allowedLevels.join(", ");
  return "All levels";
}

function resolveStyleSelection(
  rule: ProductAccessRule | undefined,
  allStyles: { id: string; name: string }[]
): { mode: StyleSelectionMode; selectable: StyleOption[]; pickCount: number } {
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

  // Run hydration AND direct-DB queries in parallel
  const [, cocDone, products, terms, allStudentSubs] = await Promise.all([
    ensureOperationalDataHydrated(),
    cachedCocCheck(user.id, CURRENT_CODE_OF_CONDUCT.version),
    cachedGetProducts(),
    cachedGetTerms(),
    cachedGetStudentSubs(user.id),
  ]);
  if (!cocDone) redirect("/onboarding");
  lazyExpireSubscriptions().catch(() => {});

  const danceStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));
  const accessRulesMap = buildDynamicAccessRulesMap(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      productType: p.productType,
      allowedLevels: p.allowedLevels ?? null,
      allowedStyleIds: p.allowedStyleIds ?? null,
      styleAccessMode: p.styleAccessMode ?? null,
      styleAccessPickCount: p.styleAccessPickCount ?? null,
      allowedClassTypes: p.allowedClassTypes ?? null,
    })),
    danceStyles,
  );
  const todayStr = getTodayStr();
  const currentTerm = getCurrentTerm(terms, todayStr);
  const nextTerm = getNextTerm(terms, todayStr);

  const studentSubs = allStudentSubs.filter((s) => s.status === "active");

  const termsById = new Map(terms.map((t) => [t.id, t]));

  const currentSubByProduct = new Map<string, (typeof studentSubs)[number]>();
  const renewalSubByProduct = new Map<string, (typeof studentSubs)[number]>();
  const coveredTermsByProduct = new Map<string, Set<string>>();

  for (const s of studentSubs) {
    if (s.termId) {
      if (!coveredTermsByProduct.has(s.productId)) {
        coveredTermsByProduct.set(s.productId, new Set());
      }
      const coveredSet = coveredTermsByProduct.get(s.productId)!;
      coveredSet.add(s.termId);

      if (s.validUntil && s.validUntil > s.validFrom) {
        for (const t of terms) {
          if (s.validFrom <= t.endDate && s.validUntil >= t.startDate) {
            coveredSet.add(t.id);
          }
        }
      }
    }

    if (s.validFrom > todayStr) {
      const existing = renewalSubByProduct.get(s.productId);
      if (!existing || s.validFrom < existing.validFrom) {
        renewalSubByProduct.set(s.productId, s);
      }
    } else if (!s.validUntil || s.validUntil >= todayStr) {
      currentSubByProduct.set(s.productId, s);
    }
  }

  const { studentTermSelectionEnabled, termPurchaseWindowDays } = getSettings();

  const rawEligibleTerms: TermOption[] = [];
  if (currentTerm && isCurrentTermPurchasable(currentTerm.startDate, todayStr, termPurchaseWindowDays)) {
    rawEligibleTerms.push({ id: currentTerm.id, name: currentTerm.name, startDate: currentTerm.startDate, isFuture: false });
  }
  if (nextTerm) rawEligibleTerms.push({ id: nextTerm.id, name: nextTerm.name, startDate: nextTerm.startDate, isFuture: true });

  const stripeAvailable = isStripeEnabled();

  // Preview discounted pricing for every catalog product at once (single
  // load of rules + affiliations + first-time gate). The returned numbers
  // are NOT persisted — the actual frozen snapshot is recomputed at the
  // moment of purchase via priceProductForStudent({ commit: ... }) so
  // we never display a price the engine would not honour at commit time.
  const visibleProducts = products.filter((p) => p.isActive && !p.archivedAt);
  const pricingPreview = await previewPricingForStudent({
    studentId: user.id,
    products: visibleProducts.map((p) => ({
      id: p.id,
      productType: p.productType,
      priceCents: p.priceCents,
    })),
  });

  const catalog: CatalogProduct[] = visibleProducts
    .map((p) => {
      let termName: string | null = null;
      if (p.termBound) {
        if (currentTerm?.name) termName = currentTerm.name;
        else if (nextTerm?.name) termName = `Next: ${nextTerm.name}`;
      }

      const { mode, selectable, pickCount } = resolveStyleSelection(accessRulesMap.get(p.id), danceStyles);

      const curSub = currentSubByProduct.get(p.id);
      const renSub = renewalSubByProduct.get(p.id);
      const isDropIn = p.productType === "drop_in";

      // Drop-ins are stackable: count active ones instead of blocking purchase
      const activeDropInCount = isDropIn
        ? studentSubs.filter((s) => s.productId === p.id).length
        : 0;

      const preview = pricingPreview.get(p.id);
      const appliedDiscounts: AppliedDiscountSummary[] = preview
        ? preview.appliedDiscounts.map((d) => ({
            code: d.code,
            name: d.name,
            ruleType: d.ruleType,
            affiliationType: d.affiliationType,
            amountCents: d.amountCents,
          }))
        : [];

      return {
        id: p.id,
        name: p.name,
        productType: p.productType,
        description: p.description,
        longDescription: p.longDescription,
        priceCents: p.priceCents,
        originalPriceCents: preview?.basePriceCents ?? p.priceCents,
        discountAmountCents: preview?.totalDiscountCents ?? 0,
        finalPriceCents: preview?.finalPriceCents ?? p.priceCents,
        appliedDiscounts,
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
        currentEntitlement: isDropIn ? null : curSub ? { paymentStatus: curSub.paymentStatus } : null,
        renewalEntitlement: isDropIn ? null : renSub
          ? { paymentStatus: renSub.paymentStatus, termName: renSub.termId ? termsById.get(renSub.termId)?.name ?? null : null, isRenewal: !!renSub.renewedFromId }
          : null,
        activeDropInCount,
        styleSelectionMode: mode,
        selectableStyles: selectable,
        pickCount,
        eligibleTerms: studentTermSelectionEnabled && p.termBound && rawEligibleTerms.length > 0
          ? rawEligibleTerms
          : null,
        coveredTermIds: [...(coveredTermsByProduct.get(p.id) ?? [])],
        autoRenew: p.autoRenew,
      };
    })
    .sort((a, b) => a.finalPriceCents - b.finalPriceCents);

  return <StudentCatalog products={catalog} stripeEnabled={stripeAvailable} />;
}
