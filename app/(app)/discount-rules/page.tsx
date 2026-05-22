import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
import {
  getAffiliationRepo,
  getDiscountRuleRepo,
  getProductRepo,
  getSpecialEventRepo,
} from "@/lib/repositories";
import { cachedGetAllStudents } from "@/lib/server/cached-queries";
import { ensureOperationalDataHydrated } from "@/lib/supabase/hydrate-operational";
import { DiscountRulesPanel } from "@/components/discount-rules/discount-rules-panel";

/**
 * Phase A — full admin CRUD for discount rules.
 *
 * Source-of-truth invariant:
 *   BPM calculates, Stripe charges, webhook persists the frozen result.
 *
 * This page only manages the *catalogue* of rules. Editing or deleting
 * rules never mutates historical subscriptions: each subscription carries
 * a frozen `appliedDiscount` snapshot at purchase time. Activating /
 * deactivating / changing rules only affects future evaluations.
 */
export default async function DiscountRulesPage() {
  await requirePermission("discounts:view");
  await ensureOperationalDataHydrated();

  const specialEventRepo = getSpecialEventRepo();
  const [rules, products, students, affiliations, access, allEvents] =
    await Promise.all([
      getDiscountRuleRepo().getAll(),
      getProductRepo().getAll(),
      cachedGetAllStudents(),
      getAffiliationRepo().getAll(),
      getStaffAccess(),
      specialEventRepo.getAllEvents(),
    ]);

  // Flatten event_products → admin pickable rows. Each row carries the
  // parent event title so admins can disambiguate identical ticket names
  // (e.g. multiple "Full Pass" across different events).
  const eventProductsList: Array<{
    id: string;
    name: string;
    eventTitle: string;
    eventId: string;
    productType: string;
    priceCents: number;
  }> = [];
  // Phase 5 — also gather every event purchase so we can compute promo-
  // code usage counts (paid + pending, excluding refunded) and surface
  // them in the admin table. Same scan we already do per event in
  // `pricing-service.checkPromoCodeUsage` — pulled up to the page-level
  // fetch so the panel can render usage without N+1 round trips.
  const allPurchases: Array<{
    paymentStatus: string | null;
    appliedDiscount: unknown;
  }> = [];
  for (const e of allEvents) {
    const ps = await specialEventRepo.getProductsByEvent(e.id);
    for (const p of ps) {
      eventProductsList.push({
        id: p.id,
        name: p.name,
        eventTitle: e.title,
        eventId: e.id,
        productType: p.productType,
        priceCents: p.priceCents,
      });
    }
    const purchases = await specialEventRepo.getPurchasesByEvent(e.id);
    for (const pur of purchases) {
      allPurchases.push({
        paymentStatus: pur.paymentStatus,
        appliedDiscount: pur.appliedDiscount,
      });
    }
  }

  function countRuleUsage(ruleId: string): number {
    let n = 0;
    for (const p of allPurchases) {
      if (p.paymentStatus === "refunded") continue;
      const snap = p.appliedDiscount as
        | { appliedDiscounts?: Array<{ ruleId?: string }> }
        | null;
      if (snap?.appliedDiscounts?.some((d) => d.ruleId === ruleId)) {
        n += 1;
      }
    }
    return n;
  }

  const permissions = {
    canCreate: hasPermission(access, "discounts:create"),
    canEdit: hasPermission(access, "discounts:edit"),
    canDelete: hasPermission(access, "discounts:delete"),
    canPreview: hasPermission(access, "discounts:preview"),
  };

  // Count how many *verified* affiliations exist per type. Surfaced in
  // the rule list so admins can see at a glance whether an affiliation
  // rule actually has any students who could trigger it.
  const verifiedCountByType: Record<string, number> = {};
  for (const a of affiliations) {
    if (a.verificationStatus !== "verified") continue;
    verifiedCountByType[a.affiliationType] =
      (verifiedCountByType[a.affiliationType] ?? 0) + 1;
  }

  return (
    <DiscountRulesPanel
      rules={rules.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        ruleType: r.ruleType,
        affiliationType: r.affiliationType,
        discountKind: r.discountKind,
        discountValue: r.discountValue,
        appliesToProductTypes: r.appliesToProductTypes,
        appliesToProductIds: r.appliesToProductIds,
        appliesToEventProductIds: r.appliesToEventProductIds ?? null,
        minPriceCents: r.minPriceCents,
        maxDiscountCents: r.maxDiscountCents,
        isActive: r.isActive,
        priority: r.priority,
        stackable: r.stackable,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        firstTimeScope: r.firstTimeScope ?? "any_purchase",
        firstTimeProductIds: r.firstTimeProductIds,
        requiresCode: r.requiresCode ?? false,
        maxUses: r.maxUses ?? null,
        oneUsePerEmail: r.oneUsePerEmail ?? false,
        usedCount: countRuleUsage(r.id),
      }))}
      products={products
        .filter((p) => !p.archivedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          productType: p.productType,
          priceCents: p.priceCents,
        }))}
      eventProducts={eventProductsList}
      students={students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        email: s.email,
      }))}
      verifiedAffiliationCounts={verifiedCountByType}
      permissions={permissions}
    />
  );
}
