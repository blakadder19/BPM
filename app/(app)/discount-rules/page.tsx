import {
  getStaffAccess,
  hasPermission,
  requirePermission,
} from "@/lib/staff-permissions";
import {
  getAffiliationRepo,
  getDiscountRuleRepo,
  getProductRepo,
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

  const [rules, products, students, affiliations, access] = await Promise.all([
    getDiscountRuleRepo().getAll(),
    getProductRepo().getAll(),
    cachedGetAllStudents(),
    getAffiliationRepo().getAll(),
    getStaffAccess(),
  ]);

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
        minPriceCents: r.minPriceCents,
        maxDiscountCents: r.maxDiscountCents,
        isActive: r.isActive,
        priority: r.priority,
        stackable: r.stackable,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
      }))}
      products={products
        .filter((p) => !p.archivedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          productType: p.productType,
          priceCents: p.priceCents,
        }))}
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
