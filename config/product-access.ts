/**
 * Product access rules — determines which classes each product grants access to.
 *
 * Style access modes:
 *   "all"             — any style (rainbow membership, drop-in)
 *   "fixed"           — hard-coded list of style IDs (yoga, bachata, salsa products)
 *   "selected_style"  — student picks ONE style at purchase time (Latin passes, Beg 1&2)
 *   "course_group"    — student picks N from a pool (Latin Combo)
 *   "social_only"     — socials only (excluded from class booking flow)
 *
 * Standard memberships explicitly EXCLUDE Salsa & Bachata styles.
 * Per BPM pricing: "N classes per month (excluding Salsa & Bachata classes)."
 */

import type { ClassType } from "@/types/domain";

// ── Style access discriminated union ────────────────────────

export type StyleAccess =
  | { type: "all" }
  | { type: "fixed"; styleIds: string[] }
  | { type: "selected_style"; allowedStyleIds?: string[] }
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

// ── Style ID groups ─────────────────────────────────────────

const BACHATA_STYLE_IDS = ["ds-1", "ds-2", "ds-3"];
const SALSA_STYLE_IDS = ["ds-4", "ds-5"];
const YOGA_STYLE_IDS = ["ds-9"];
export const ALL_LATIN_STYLE_IDS = [...BACHATA_STYLE_IDS, ...SALSA_STYLE_IDS];
export const LATIN_COMBO_POOL_STYLE_IDS = ["ds-1", "ds-4", "ds-5"];

/**
 * Standard memberships include everything EXCEPT Salsa & Bachata.
 * Per BPM: Reggaeton, Ladies Styling, Afro-Cuban, Yoga, Kids Hip Hop.
 */
const STANDARD_MEMBERSHIP_STYLE_IDS = ["ds-6", "ds-7", "ds-8", "ds-9", "ds-10"];

// ── Product access rules ────────────────────────────────────

export const PRODUCT_ACCESS_RULES: ProductAccessRule[] = [
  // ── Drop-in ─────────────────────────────────────────────
  {
    productId: "p-dropin",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Latin Passes (selected style) ───────────────────────
  {
    productId: "p-lat-bronze",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style", allowedStyleIds: ALL_LATIN_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-lat-silver",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style", allowedStyleIds: ALL_LATIN_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-lat-gold",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style", allowedStyleIds: ALL_LATIN_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Yoga Passes (yoga only) ─────────────────────────────
  {
    productId: "p-yoga-bronze",
    allowedClassTypes: ["class"],
    styleAccess: { type: "fixed", styleIds: YOGA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-yoga-silver",
    allowedClassTypes: ["class"],
    styleAccess: { type: "fixed", styleIds: YOGA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-yoga-gold",
    allowedClassTypes: ["class"],
    styleAccess: { type: "fixed", styleIds: YOGA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: true,
    provisionalNote: "Gold Yoga Pass extrapolated from pricing pattern — pending confirmation",
  },

  // ── Promo passes ────────────────────────────────────────
  {
    productId: "p-beg12",
    allowedClassTypes: ["class"],
    styleAccess: { type: "selected_style", allowedStyleIds: ALL_LATIN_STYLE_IDS },
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

  // ── Social Pass ─────────────────────────────────────────
  {
    productId: "p-social",
    allowedClassTypes: ["social"],
    styleAccess: { type: "social_only" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: "Socials are not part of the class booking flow",
  },

  // ── Bronze Memberships (4 classes/term) ─────────────────
  {
    productId: "p-mem-bronze-std",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: STANDARD_MEMBERSHIP_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-bronze-bach",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: BACHATA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-bronze-salsa",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: SALSA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-bronze-yoga",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: YOGA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Silver Memberships (8 classes/term) ─────────────────
  {
    productId: "p-mem-silver-std",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: STANDARD_MEMBERSHIP_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-silver-bach",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: BACHATA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-silver-salsa",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: SALSA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-silver-yoga",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: YOGA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Gold Memberships (12 classes/term) ──────────────────
  {
    productId: "p-mem-gold-std",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: STANDARD_MEMBERSHIP_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-gold-bach",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: BACHATA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-gold-salsa",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: SALSA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-gold-yoga",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: YOGA_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Rainbow Membership (all-access, 16 classes/term) ────
  {
    productId: "p-mem-rainbow",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
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
 * Builds an access-rules map that works with REAL product IDs (e.g. Supabase UUIDs),
 * not just the hardcoded seed IDs in PRODUCT_ACCESS_RULES.
 *
 * Strategy:
 * 1. Start with the hardcoded rules (covers seed products).
 * 2. For each real product NOT already in the map, match by name to a seed product's rule.
 * 3. If no name match, infer a default rule from the product's type and properties.
 */
export function buildDynamicAccessRulesMap(
  products: { id: string; name: string; productType: string; allowedLevels: string[] | null }[]
): Map<string, ProductAccessRule> {
  const map = new Map(rulesByProductId);

  const seedNameToRule = new Map<string, ProductAccessRule>();
  try {
    const { PRODUCTS } = require("@/lib/mock-data");
    for (const sp of PRODUCTS as { id: string; name: string }[]) {
      const rule = rulesByProductId.get(sp.id);
      if (rule) seedNameToRule.set(sp.name, rule);
    }
  } catch {
    // seed data unavailable — rely on inference below
  }

  for (const p of products) {
    if (map.has(p.id)) continue;

    const matched = seedNameToRule.get(p.name);
    if (matched) {
      map.set(p.id, { ...matched, productId: p.id });
      continue;
    }

    const inferred: ProductAccessRule = {
      productId: p.id,
      allowedClassTypes: p.productType === "membership" ? ["class", "student_practice"] : ["class"],
      styleAccess: { type: "all" },
      allowedLevels: p.allowedLevels,
      isProvisional: true,
      provisionalNote: `Auto-inferred rule for "${p.name}"`,
    };
    map.set(p.id, inferred);
  }

  return map;
}

/**
 * Human-readable summary of a product's access rule.
 * When resolveStyleName is provided, fixed style lists are rendered with names.
 */
export function describeAccess(
  rule: ProductAccessRule,
  resolveStyleName?: (id: string) => string | undefined
): string {
  const sa = rule.styleAccess;
  const levels = rule.allowedLevels
    ? rule.allowedLevels.join(", ")
    : "All levels";

  let styleDesc: string;
  switch (sa.type) {
    case "all":
      styleDesc = "All styles";
      break;
    case "fixed": {
      if (sa.styleIds.length === 0) {
        styleDesc = "No styles (TBD)";
      } else if (isStandardMembershipStyleSet(sa.styleIds)) {
        styleDesc = "Excl. Salsa & Bachata";
      } else if (resolveStyleName) {
        const names = sa.styleIds
          .map(resolveStyleName)
          .filter(Boolean);
        styleDesc =
          names.length > 0 ? names.join(", ") : `${sa.styleIds.length} style(s)`;
      } else {
        styleDesc = `${sa.styleIds.length} fixed style(s)`;
      }
      break;
    }
    case "selected_style":
      styleDesc = sa.allowedStyleIds
        ? `1 of ${sa.allowedStyleIds.length} styles`
        : "1 selected style";
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

function isStandardMembershipStyleSet(styleIds: string[]): boolean {
  if (styleIds.length !== STANDARD_MEMBERSHIP_STYLE_IDS.length) return false;
  const sorted = [...styleIds].sort();
  const expected = [...STANDARD_MEMBERSHIP_STYLE_IDS].sort();
  return sorted.every((id, i) => id === expected[i]);
}
