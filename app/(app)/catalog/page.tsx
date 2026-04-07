import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getProductRepo, getTermRepo, getSubscriptionRepo, getCocRepo } from "@/lib/repositories";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { getCurrentTerm, getNextTerm, isCurrentTermPurchasable } from "@/lib/domain/term-rules";
import { getTodayStr } from "@/lib/domain/datetime";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import { getSettings } from "@/lib/services/settings-store";
import { lazyExpireSubscriptions } from "@/lib/actions/term-lifecycle";
import { getAccessRule } from "@/config/product-access";
import { TERM_PURCHASE_WINDOW_DAYS } from "@/config/business-rules";
import { isStripeEnabled } from "@/lib/stripe";
import { StudentCatalog, type CatalogProduct, type StyleOption, type StyleSelectionMode, type TermOption } from "@/components/catalog/student-catalog";
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

  const cocDone = await getCocRepo().hasAcceptedVersion(user.id, CURRENT_CODE_OF_CONDUCT.version);
  if (!cocDone) redirect("/onboarding");
  await lazyExpireSubscriptions();

  const [products, terms, allSubs] = await Promise.all([
    getProductRepo().getAll(),
    getTermRepo().getAll(),
    getSubscriptionRepo().getAll(),
  ]);

  const danceStyles = getDanceStyles().map((s) => ({ id: s.id, name: s.name }));
  const todayStr = getTodayStr();
  const currentTerm = getCurrentTerm(terms, todayStr);
  const nextTerm = getNextTerm(terms, todayStr);

  const studentSubs = allSubs.filter(
    (s) => s.studentId === user.id && s.status === "active"
  );

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

  const { studentTermSelectionEnabled } = getSettings();

  const rawEligibleTerms: TermOption[] = [];
  if (currentTerm && isCurrentTermPurchasable(currentTerm.startDate, todayStr, TERM_PURCHASE_WINDOW_DAYS)) {
    rawEligibleTerms.push({ id: currentTerm.id, name: currentTerm.name, startDate: currentTerm.startDate, isFuture: false });
  }
  if (nextTerm) rawEligibleTerms.push({ id: nextTerm.id, name: nextTerm.name, startDate: nextTerm.startDate, isFuture: true });

  const stripeAvailable = isStripeEnabled();

  const catalog: CatalogProduct[] = products
    .filter((p) => p.isActive)
    .map((p) => {
      let termName: string | null = null;
      if (p.termBound) {
        if (currentTerm?.name) termName = currentTerm.name;
        else if (nextTerm?.name) termName = `Next: ${nextTerm.name}`;
      }

      const { mode, selectable, pickCount } = resolveStyleSelection(p, danceStyles);

      const curSub = currentSubByProduct.get(p.id);
      const renSub = renewalSubByProduct.get(p.id);

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
        currentEntitlement: curSub ? { paymentStatus: curSub.paymentStatus } : null,
        renewalEntitlement: renSub
          ? { paymentStatus: renSub.paymentStatus, termName: renSub.termId ? termsById.get(renSub.termId)?.name ?? null : null, isRenewal: !!renSub.renewedFromId }
          : null,
        styleSelectionMode: mode,
        selectableStyles: selectable,
        pickCount,
        eligibleTerms: studentTermSelectionEnabled && p.termBound && rawEligibleTerms.length > 0
          ? rawEligibleTerms
          : null,
        coveredTermIds: [...(coveredTermsByProduct.get(p.id) ?? [])],
      };
    })
    .sort((a, b) => a.priceCents - b.priceCents);

  return <StudentCatalog products={catalog} stripeEnabled={stripeAvailable} />;
}
