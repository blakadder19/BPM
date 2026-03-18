/**
 * Product access rules — determines which classes each product grants access to.
 *
 * Style access modes:
 *   "all"             — any style (memberships, drop-in)
 *   "fixed"           — hard-coded list of style IDs (yoga products)
 *   "selected_style"  — student picks ONE style at purchase time (Beginners 1&2)
 *   "course_group"    — student picks N from a pool (Latin Combo)
 *   "social_only"     — socials only (excluded from class booking flow)
 *
 * PROVISIONAL rules are clearly marked. The exact mapping for Bronze/Silver/Gold
 * tiers and Yoga products is pending academy confirmation.
 */

import type { ClassType } from "@/types/domain";

// ── Style access discriminated union ────────────────────────

export type StyleAccess =
  | { type: "all" }
  | { type: "fixed"; styleIds: string[] }
  | { type: "selected_style" }
  | { type: "course_group"; poolStyleIds: string[]; pickCount: number }
  | { type: "social_only" };

// ── Access rule per product ─────────────────────────────────

export interface ProductAccessRule {
  productId: string;
  allowedClassTypes: ClassType[];
  styleAccess: StyleAccess;
  allowedLevels: string[] | null;
  isProvisional: boolean;
  provisionalNote: string | null;
}

// ── Configurable pool for Latin Combo ───────────────────────

/**
 * PROVISIONAL — the three "beginner Latin partner" styles.
 * Students pick 2 of these when purchasing the Beginners Latin Combo.
 */
export const LATIN_COMBO_POOL_STYLE_IDS = ["ds-1", "ds-4", "ds-5"]; // Bachata, Cuban, Salsa Line

// ── Product access rules ────────────────────────────────────

export const PRODUCT_ACCESS_RULES: ProductAccessRule[] = [
  // ── Memberships (term-bound, classesPerTerm-based) ─────
  {
    productId: "p-mem-4",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-8",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-12",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-16",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Passes (term-bound, credit-based, selected style) ──
  {
    productId: "p-pass-bronze",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-pass-silver",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-pass-gold",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Drop-in ─────────────────────────────────────────────
  {
    productId: "p-dropin",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Promo passes ────────────────────────────────────────
  {
    productId: "p-beg12",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style" },
    allowedLevels: ["Beginner 1", "Beginner 2"],
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-latin-combo",
    allowedClassTypes: ["class"],
    styleAccess: {
      type: "course_group",
      poolStyleIds: LATIN_COMBO_POOL_STYLE_IDS,
      pickCount: 2,
    },
    allowedLevels: ["Beginner 1"],
    isProvisional: true,
    provisionalNote: "Pick 2 of 3 Latin styles; exact pool configurable",
  },

  // ── Social ──────────────────────────────────────────────
  {
    productId: "p-social",
    allowedClassTypes: ["social"],
    styleAccess: { type: "social_only" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: "Socials are not part of the class booking flow",
  },
];

// ── Lookup helpers ──────────────────────────────────────────

const rulesByProductId = new Map(
  PRODUCT_ACCESS_RULES.map((r) => [r.productId, r])
);

export function getAccessRule(productId: string): ProductAccessRule | undefined {
  return rulesByProductId.get(productId);
}

export function getAccessRulesMap(): Map<string, ProductAccessRule> {
  return rulesByProductId;
}

/**
 * Human-readable summary of a product's access rule.
 */
export function describeAccess(rule: ProductAccessRule): string {
  const sa = rule.styleAccess;
  const levels = rule.allowedLevels
    ? rule.allowedLevels.join(", ")
    : "All levels";

  let styleDesc: string;
  switch (sa.type) {
    case "all":
      styleDesc = "All styles";
      break;
    case "fixed":
      styleDesc = sa.styleIds.length > 0
        ? `${sa.styleIds.length} fixed style(s)`
        : "No styles (TBD)";
      break;
    case "selected_style":
      styleDesc = "1 selected style";
      break;
    case "course_group":
      styleDesc = `Pick ${sa.pickCount} of ${sa.poolStyleIds.length}`;
      break;
    case "social_only":
      styleDesc = "Socials only";
      break;
  }

  return `${styleDesc} · ${levels}`;
}
