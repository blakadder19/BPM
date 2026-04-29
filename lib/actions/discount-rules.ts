"use server";

/**
 * Admin CRUD + preview server actions for discount rules.
 *
 * Source-of-truth invariant (do NOT break):
 *   BPM calculates, Stripe charges, webhook persists the frozen result.
 *
 * These actions only manage the *catalogue* of rules. They never compute
 * pricing themselves — `previewDiscountRuleAction` always delegates to the
 * pure pricing engine (`previewPricingForStudent`) so the academy sees
 * exactly what a real purchase would receive.
 *
 * Editing or deleting rules NEVER mutates historical subscription rows:
 * the `applied_discount` snapshot is frozen on each subscription at
 * purchase time. This file only affects future evaluations.
 */
import { revalidatePath } from "next/cache";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import type { Permission } from "@/lib/domain/permissions";

/**
 * Local guard helper: every discount-rule action used to call
 * `requireRole(["admin"])` and then read the resolved admin's
 * fullName/email for audit logs. We now gate on a specific permission
 * (so a Read-Only or Front-Desk role can't mutate rules even if they
 * are technically users.role='admin') and surface the same admin
 * AuthUser back to the caller for audit-log parity.
 */
async function gateDiscountRule(perm: Permission) {
  const g = await requirePermissionForAction(perm);
  if (!g.ok) return { ok: false as const, error: g.error };
  return { ok: true as const, admin: g.access.user };
}
import {
  getDiscountRuleRepo,
  getProductRepo,
  getSubscriptionRepo,
} from "@/lib/repositories";
import {
  AFFILIATION_TYPES,
  DISCOUNT_KINDS,
  DISCOUNT_RULE_TYPES,
  type AffiliationType,
  type DiscountKind,
  type DiscountRuleType,
} from "@/lib/domain/pricing-engine";
import { logFinanceEvent } from "@/lib/services/finance-audit-log";
import { previewPricingForStudent } from "@/lib/services/pricing-service";
import type { ProductType } from "@/types/domain";

const RULE_TYPE_SET = new Set<string>(DISCOUNT_RULE_TYPES);
const KIND_SET = new Set<string>(DISCOUNT_KINDS);
const AFFILIATION_TYPE_SET = new Set<string>(AFFILIATION_TYPES);
const PRODUCT_TYPE_SET = new Set<ProductType>(["membership", "pass", "drop_in"]);

// ── Input shape (shared by create + update) ──────────────────

export interface DiscountRuleInput {
  code: string;
  name: string;
  description: string | null;
  ruleType: DiscountRuleType;
  affiliationType: AffiliationType | null;
  discountKind: DiscountKind;
  discountValue: number;
  appliesToProductTypes: ProductType[] | null;
  appliesToProductIds: string[] | null;
  minPriceCents: number | null;
  maxDiscountCents: number | null;
  isActive: boolean;
  priority: number;
  stackable: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

// ── Validation ───────────────────────────────────────────────

interface ValidatedRuleInput extends DiscountRuleInput {}

/**
 * Strict server-side validation. UI hints exist but are advisory; this
 * function is the only authoritative gate before a row hits the repo.
 */
async function validateInput(
  raw: DiscountRuleInput,
  opts: { allowExistingId?: string } = {},
): Promise<{ ok: true; value: ValidatedRuleInput } | { ok: false; error: string }> {
  const code = raw.code?.trim();
  const name = raw.name?.trim();
  if (!code) return { ok: false, error: "Code is required." };
  if (!/^[A-Z0-9_-]{2,32}$/i.test(code)) {
    return { ok: false, error: "Code must be 2–32 characters: letters, digits, _ or -." };
  }
  if (!name) return { ok: false, error: "Name is required." };

  if (!RULE_TYPE_SET.has(raw.ruleType)) {
    return { ok: false, error: "Invalid rule type." };
  }
  if (!KIND_SET.has(raw.discountKind)) {
    return { ok: false, error: "Invalid discount kind." };
  }

  if (!Number.isFinite(raw.discountValue) || raw.discountValue <= 0) {
    return { ok: false, error: "Discount value must be greater than zero." };
  }
  if (raw.discountKind === "percentage" && raw.discountValue > 100) {
    return { ok: false, error: "Percentage discount cannot exceed 100%." };
  }

  if (raw.maxDiscountCents != null) {
    if (!Number.isFinite(raw.maxDiscountCents) || raw.maxDiscountCents < 0) {
      return { ok: false, error: "Max discount cap must be non-negative." };
    }
  }
  if (raw.minPriceCents != null) {
    if (!Number.isFinite(raw.minPriceCents) || raw.minPriceCents < 0) {
      return { ok: false, error: "Min basket price must be non-negative." };
    }
  }

  if (!Number.isInteger(raw.priority)) {
    return { ok: false, error: "Priority must be an integer." };
  }

  if (raw.validFrom && raw.validUntil && raw.validFrom > raw.validUntil) {
    return { ok: false, error: "Valid-until cannot be before valid-from." };
  }

  // Type-specific consistency.
  if (raw.ruleType === "first_time_purchase") {
    if (raw.affiliationType) {
      return {
        ok: false,
        error: "First-time rules must not require an affiliation type.",
      };
    }
  }
  if (raw.ruleType === "affiliation") {
    if (!raw.affiliationType || !AFFILIATION_TYPE_SET.has(raw.affiliationType)) {
      return {
        ok: false,
        error: "Affiliation rules must specify a valid affiliation type.",
      };
    }
  }

  if (raw.appliesToProductTypes) {
    for (const t of raw.appliesToProductTypes) {
      if (!PRODUCT_TYPE_SET.has(t)) {
        return { ok: false, error: `Invalid product type "${t}".` };
      }
    }
  }

  if (raw.appliesToProductIds && raw.appliesToProductIds.length > 0) {
    const all = await getProductRepo().getAll();
    const valid = new Set(all.map((p) => p.id));
    for (const id of raw.appliesToProductIds) {
      if (!valid.has(id)) {
        return { ok: false, error: `Product id "${id}" does not exist.` };
      }
    }
  }

  // Code uniqueness — case-insensitive, ignore the row being edited.
  const existing = await getDiscountRuleRepo().getAll();
  const codeUpper = code.toUpperCase();
  const clash = existing.find(
    (r) => r.code.toUpperCase() === codeUpper && r.id !== opts.allowExistingId,
  );
  if (clash) {
    return { ok: false, error: `Code "${code}" is already used by another rule.` };
  }

  return {
    ok: true,
    value: {
      ...raw,
      code: code.toUpperCase(),
      name,
      description: raw.description?.trim() || null,
    },
  };
}

// ── CRUD ─────────────────────────────────────────────────────

export async function createDiscountRuleAction(
  input: DiscountRuleInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const g = await gateDiscountRule("discounts:create");
  if (!g.ok) return { success: false, error: g.error };
  const admin = g.admin;
  const v = await validateInput(input);
  if (!v.ok) return { success: false, error: v.error };

  try {
    const created = await getDiscountRuleRepo().create({
      code: v.value.code,
      name: v.value.name,
      description: v.value.description,
      ruleType: v.value.ruleType,
      affiliationType: v.value.affiliationType,
      discountKind: v.value.discountKind,
      discountValue: v.value.discountValue,
      appliesToProductTypes: v.value.appliesToProductTypes,
      appliesToProductIds: v.value.appliesToProductIds,
      minPriceCents: v.value.minPriceCents,
      maxDiscountCents: v.value.maxDiscountCents,
      isActive: v.value.isActive,
      priority: v.value.priority,
      stackable: v.value.stackable,
      validFrom: v.value.validFrom,
      validUntil: v.value.validUntil,
    });

    logFinanceEvent({
      entityType: "subscription",
      entityId: `discount_rule:${created.id}`,
      action: "created",
      performer: { userId: admin.id, email: admin.email, name: admin.fullName },
      detail: `Discount rule created: ${created.code}`,
      newValue: created.code,
      metadata: {
        kind: "discount_rule_create",
        ruleType: created.ruleType,
        discountKind: created.discountKind,
        discountValue: created.discountValue,
      },
    });

    revalidatePath("/discount-rules");
    return { success: true, id: created.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updateDiscountRuleAction(
  id: string,
  input: DiscountRuleInput,
): Promise<{ success: boolean; error?: string }> {
  const g = await gateDiscountRule("discounts:edit");
  if (!g.ok) return { success: false, error: g.error };
  const admin = g.admin;
  if (!id) return { success: false, error: "Missing rule id." };

  const existing = await getDiscountRuleRepo().getById(id);
  if (!existing) return { success: false, error: "Rule not found." };

  const v = await validateInput(input, { allowExistingId: id });
  if (!v.ok) return { success: false, error: v.error };

  try {
    const updated = await getDiscountRuleRepo().update(id, {
      code: v.value.code,
      name: v.value.name,
      description: v.value.description,
      ruleType: v.value.ruleType,
      affiliationType: v.value.affiliationType,
      discountKind: v.value.discountKind,
      discountValue: v.value.discountValue,
      appliesToProductTypes: v.value.appliesToProductTypes,
      appliesToProductIds: v.value.appliesToProductIds,
      minPriceCents: v.value.minPriceCents,
      maxDiscountCents: v.value.maxDiscountCents,
      isActive: v.value.isActive,
      priority: v.value.priority,
      stackable: v.value.stackable,
      validFrom: v.value.validFrom,
      validUntil: v.value.validUntil,
    });

    if (!updated) return { success: false, error: "Update failed." };

    logFinanceEvent({
      entityType: "subscription",
      entityId: `discount_rule:${id}`,
      action: "manual_edit",
      performer: { userId: admin.id, email: admin.email, name: admin.fullName },
      detail: `Discount rule edited: ${updated.code}`,
      previousValue: existing.code,
      newValue: updated.code,
      metadata: {
        kind: "discount_rule_update",
      },
    });

    revalidatePath("/discount-rules");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Activate / deactivate a rule. Soft toggle is preferred over deleting,
 * because a deactivated rule retains its identity (audit, snapshots can
 * still reference it by id) and can be re-enabled safely.
 */
export async function toggleDiscountRuleActiveAction(
  id: string,
  isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
  const g = await gateDiscountRule("discounts:edit");
  if (!g.ok) return { success: false, error: g.error };
  const admin = g.admin;
  if (!id) return { success: false, error: "Missing rule id." };

  const existing = await getDiscountRuleRepo().getById(id);
  if (!existing) return { success: false, error: "Rule not found." };

  try {
    await getDiscountRuleRepo().update(id, { isActive });
    logFinanceEvent({
      entityType: "subscription",
      entityId: `discount_rule:${id}`,
      action: "status_changed",
      performer: { userId: admin.id, email: admin.email, name: admin.fullName },
      detail: `Discount rule ${isActive ? "activated" : "deactivated"}: ${existing.code}`,
      previousValue: existing.isActive ? "active" : "inactive",
      newValue: isActive ? "active" : "inactive",
    });
    revalidatePath("/discount-rules");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Hard-delete a discount rule.
 *
 * Safety:
 *   - Historical subscriptions carry a frozen `appliedDiscount` snapshot
 *     that includes the rule's id, code, name, type, and the actual
 *     amount applied. Deleting a rule does NOT mutate those rows.
 *   - The Stripe webhook fulfillment path can rehydrate display fields
 *     from the rule by id (`deserializePricingFromStripe`); when the rule
 *     is gone it falls back to the code stored in metadata. The frozen
 *     amounts are unaffected.
 *   - Future pricing simply skips a deleted rule.
 *
 * Admins who are unsure should prefer Deactivate (soft) over Delete.
 */
export async function deleteDiscountRuleAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const g = await gateDiscountRule("discounts:delete");
  if (!g.ok) return { success: false, error: g.error };
  const admin = g.admin;
  if (!id) return { success: false, error: "Missing rule id." };
  const existing = await getDiscountRuleRepo().getById(id);
  if (!existing) return { success: false, error: "Rule not found." };

  try {
    await getDiscountRuleRepo().delete(id);
    logFinanceEvent({
      entityType: "subscription",
      entityId: `discount_rule:${id}`,
      action: "cancelled",
      performer: { userId: admin.id, email: admin.email, name: admin.fullName },
      detail: `Discount rule deleted: ${existing.code}`,
      previousValue: existing.code,
      metadata: {
        kind: "discount_rule_delete",
      },
    });
    revalidatePath("/discount-rules");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// ── Preview ──────────────────────────────────────────────────

export interface DiscountRulePreviewInput {
  studentId: string;
  productId: string;
  /** Optional ISO timestamp to evaluate against (defaults to "now"). */
  now?: string;
}

export interface DiscountRulePreviewResult {
  success: boolean;
  error?: string;
  basePriceCents?: number;
  finalPriceCents?: number;
  totalDiscountCents?: number;
  isFirstTime?: boolean;
  appliedDiscounts?: Array<{
    ruleId: string;
    code: string;
    name: string;
    ruleType: DiscountRuleType;
    amountCents: number;
    reason: string;
  }>;
  /**
   * Reasons returned by the engine for every rule it considered, even
   * those that were skipped. Useful so admins can debug why a rule did
   * not apply (e.g. "not yet valid", "no verified hse affiliation").
   */
  reasons?: string[];
}

/**
 * Run the pure pricing engine against a (student, product) pair to show
 * what would happen at purchase time. Strictly read-only:
 *   - Does NOT call commit mode (no atomic claim recorded).
 *   - Does NOT persist a subscription.
 *   - Does NOT touch Stripe.
 * Mirrors exactly the same evaluation the catalog and checkout paths use.
 */
export async function previewDiscountRuleAction(
  input: DiscountRulePreviewInput,
): Promise<DiscountRulePreviewResult> {
  const g = await gateDiscountRule("discounts:preview");
  if (!g.ok) return { success: false, error: g.error };

  const studentId = input.studentId?.trim();
  const productId = input.productId?.trim();
  if (!studentId) return { success: false, error: "Select a student." };
  if (!productId) return { success: false, error: "Select a product." };

  const product = await getProductRepo().getById(productId);
  if (!product) return { success: false, error: "Product not found." };

  // Reuse the same batch helper used by /catalog so the preview can
  // never drift from real student-facing pricing.
  const map = await previewPricingForStudent({
    studentId,
    products: [
      {
        id: product.id,
        productType: product.productType,
        priceCents: product.priceCents,
      },
    ],
    now: input.now,
  });
  const result = map.get(product.id);
  if (!result) return { success: false, error: "Engine returned no result." };

  // Determine first-time status purely for display.
  const subs = await getSubscriptionRepo().getByStudent(studentId);
  const hasPriorPaid = subs.some(
    (s) => s.paymentStatus === "paid" || s.paymentStatus === "pending",
  );

  return {
    success: true,
    basePriceCents: result.basePriceCents,
    finalPriceCents: result.finalPriceCents,
    totalDiscountCents: result.totalDiscountCents,
    isFirstTime: !hasPriorPaid,
    appliedDiscounts: result.appliedDiscounts.map((a) => ({
      ruleId: a.ruleId,
      code: a.code,
      name: a.name,
      ruleType: a.ruleType,
      amountCents: a.amountCents,
      reason: a.reason,
    })),
    reasons: result.reasons,
  };
}
