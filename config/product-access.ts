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
  | { type: "fixed"; styleIds: string[]; styleNames?: string[] }
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

const BACHATA_STYLE_IDS = ["ds-1", "ds-2"];
const SALSA_STYLE_IDS = ["ds-4", "ds-5"];
const YOGA_STYLE_IDS = ["ds-9"];
export const ALL_LATIN_STYLE_IDS = [...BACHATA_STYLE_IDS, ...SALSA_STYLE_IDS];

/**
 * Latin Combo pool: Bachata (ds-1), Cuban (ds-4), Salsa Line (ds-5).
 * Student picks 2 of these 3 Beginner 1 courses.
 */
export const LATIN_COMBO_POOL_STYLE_IDS = ["ds-1", "ds-4", "ds-5"];

/**
 * Standard memberships cover Yoga and Kids Hip Hop.
 */
const STANDARD_MEMBERSHIP_STYLE_IDS = ["ds-9", "ds-10"];

// ── Product access rules ────────────────────────────────────

export const PRODUCT_ACCESS_RULES: ProductAccessRule[] = [
  // ── Drop-ins ────────────────────────────────────────────
  // Active: split per-discipline drop-ins.
  {
    productId: "p-dropin-latin",
    allowedClassTypes: ["class"],
    styleAccess: { type: "fixed", styleIds: ALL_LATIN_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-dropin-yoga",
    allowedClassTypes: ["class"],
    styleAccess: { type: "fixed", styleIds: ["ds-9"] },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  // Legacy universal drop-in — kept so historical p-dropin subscriptions still resolve.
  {
    productId: "p-dropin",
    allowedClassTypes: ["class"],
    styleAccess: { type: "all" },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: "Legacy product — superseded by p-dropin-latin and p-dropin-yoga.",
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
    isProvisional: false,
    provisionalNote: null,
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
    isProvisional: false,
    provisionalNote: null,
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

  // ── Active mix-and-match memberships ────────────────────
  // Bronze & Silver: Latin styles only. Gold & Rainbow: Latin + Yoga.
  {
    productId: "p-mem-bronze",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: ALL_LATIN_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-silver",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: ALL_LATIN_STYLE_IDS },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },
  {
    productId: "p-mem-gold",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: [...ALL_LATIN_STYLE_IDS, ...YOGA_STYLE_IDS] },
    allowedLevels: null,
    isProvisional: false,
    provisionalNote: null,
  },

  // ── Rainbow Membership (Latin + Yoga mix-and-match, 16 classes/term) ────
  // Note: scope was previously "all" styles; restricted to Latin + Yoga to match the
  // updated business definition (Gold perks + yoga access + free t-shirt).
  {
    productId: "p-mem-rainbow",
    allowedClassTypes: ["class", "student_practice"],
    styleAccess: { type: "fixed", styleIds: [...ALL_LATIN_STYLE_IDS, ...YOGA_STYLE_IDS] },
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
 * Builds an access-rules map from product fields.
 *
 * Phase 3 priority order for each product:
 *   1. Saved structured fields on the product row
 *      (styleAccessMode / styleAccessPickCount / allowedClassTypes /
 *      allowedStyleIds / allowedLevels). Single source of truth when set.
 *   2. Hardcoded seed rule for that product ID/name (legacy products
 *      without saved structured fields).
 *   3. Fallback derivation from productType + allowedStyleIds.
 *
 * Style IDs always come from the product's allowedStyleIds — NOT from hardcoded
 * arrays. The seed rule only contributes the access MODE for legacy rows.
 */
type DynamicAccessProduct = {
  id: string;
  name: string;
  productType: string;
  allowedLevels: string[] | null;
  allowedStyleIds?: string[] | null;
  styleAccessMode?: StyleAccess["type"] | null;
  styleAccessPickCount?: number | null;
  allowedClassTypes?: ClassType[] | null;
};

export function buildDynamicAccessRulesMap(
  products: DynamicAccessProduct[],
  danceStyles?: { id: string; name: string }[]
): Map<string, ProductAccessRule> {
  const seedNameToRule = new Map<string, ProductAccessRule>();
  try {
    const { PRODUCTS } = require("@/lib/mock-data");
    for (const sp of PRODUCTS as { id: string; name: string }[]) {
      const rule = rulesByProductId.get(sp.id);
      if (rule) seedNameToRule.set(sp.name, rule);
    }
  } catch {
    // seed data unavailable
  }

  const mockIdRemapper = danceStyles ? buildMockIdRemapper(danceStyles) : null;
  const r = (id: string) => mockIdRemapper?.get(id) ?? id;
  const rList = (ids: string[]) => ids.map(r);
  const styleNameById = danceStyles
    ? new Map(danceStyles.map((s) => [s.id, s.name]))
    : null;

  const map = new Map<string, ProductAccessRule>();

  for (const p of products) {
    const seedRule = rulesByProductId.get(p.id) ?? seedNameToRule.get(p.name);
    const pStyleIds = p.allowedStyleIds?.length
      ? rList(p.allowedStyleIds)
      : null;

    let styleAccess: StyleAccess;
    if (p.styleAccessMode) {
      const seedPickCount = seedRule?.styleAccess.type === "course_group"
        ? seedRule.styleAccess.pickCount
        : null;
      styleAccess = buildStyleAccessFromMode(
        p.styleAccessMode,
        pStyleIds,
        p.styleAccessPickCount ?? seedPickCount,
      );
    } else if (seedRule) {
      styleAccess = overrideStyleIdsFromProduct(seedRule.styleAccess, pStyleIds, mockIdRemapper);
    } else if (pStyleIds) {
      styleAccess = { type: "fixed", styleIds: pStyleIds };
    } else {
      styleAccess = { type: "all" };
    }

    // Enrich fixed-style rules with name-based fallback for robust matching
    if (styleAccess.type === "fixed" && styleNameById) {
      const names = styleAccess.styleIds
        .map((id) => styleNameById.get(id))
        .filter((n): n is string => !!n);
      if (names.length > 0) {
        styleAccess = { ...styleAccess, styleNames: names };
      }
    }

    const rule: ProductAccessRule = {
      productId: p.id,
      allowedClassTypes:
        p.allowedClassTypes
        ?? seedRule?.allowedClassTypes
        ?? (p.productType === "membership" ? ["class", "student_practice"] : ["class"]),
      styleAccess,
      allowedLevels: p.allowedLevels ?? seedRule?.allowedLevels ?? null,
      isProvisional: seedRule?.isProvisional ?? false,
      provisionalNote: seedRule?.provisionalNote ?? null,
    };
    map.set(p.id, rule);
  }

  return map;
}

function buildStyleAccessFromMode(
  mode: StyleAccess["type"],
  productStyleIds: string[] | null,
  pickCount: number | null,
): StyleAccess {
  switch (mode) {
    case "all":
      return { type: "all" };
    case "social_only":
      return { type: "social_only" };
    case "fixed":
      return { type: "fixed", styleIds: productStyleIds ?? [] };
    case "selected_style":
      return productStyleIds
        ? { type: "selected_style", allowedStyleIds: productStyleIds }
        : { type: "selected_style" };
    case "course_group":
      return {
        type: "course_group",
        poolStyleIds: productStyleIds ?? [],
        pickCount: pickCount && pickCount > 0 ? pickCount : 1,
      };
  }
}

/**
 * Override style IDs inside a StyleAccess with the product's saved IDs,
 * keeping the access MODE from the seed rule.
 */
function overrideStyleIdsFromProduct(
  sa: StyleAccess,
  productStyleIds: string[] | null,
  mockIdRemapper: Map<string, string> | null,
): StyleAccess {
  if (!productStyleIds) {
    return mockIdRemapper ? remapStyleAccess(sa, mockIdRemapper) : sa;
  }
  switch (sa.type) {
    case "fixed":
      return { type: "fixed", styleIds: productStyleIds };
    case "selected_style":
      return { type: "selected_style", allowedStyleIds: productStyleIds };
    case "course_group":
      return { type: "course_group", poolStyleIds: productStyleIds, pickCount: sa.pickCount };
    default:
      return sa;
  }
}

/**
 * Maps mock style IDs (e.g. "ds-1") to real Supabase UUIDs by matching names.
 */
function buildMockIdRemapper(
  realStyles: { id: string; name: string }[]
): Map<string, string> {
  let mockStyles: { id: string; name: string }[];
  try {
    const { DANCE_STYLES } = require("@/lib/mock-data");
    mockStyles = DANCE_STYLES;
  } catch {
    return new Map();
  }

  const realByName = new Map(realStyles.map((s) => [s.name, s.id]));
  const remap = new Map<string, string>();
  for (const mock of mockStyles) {
    const realId = realByName.get(mock.name);
    if (realId && realId !== mock.id) {
      remap.set(mock.id, realId);
    }
  }
  return remap;
}

function remapStyleAccess(
  sa: StyleAccess,
  remap: Map<string, string>
): StyleAccess {
  if (remap.size === 0) return sa;

  const r = (id: string) => remap.get(id) ?? id;

  switch (sa.type) {
    case "fixed":
      return { ...sa, styleIds: sa.styleIds.map(r) };
    case "selected_style":
      return sa.allowedStyleIds
        ? { ...sa, allowedStyleIds: sa.allowedStyleIds.map(r) }
        : sa;
    case "course_group":
      return { ...sa, poolStyleIds: sa.poolStyleIds.map(r) };
    default:
      return sa;
  }
}

/**
 * Human-readable style and level descriptions derived from the access rule.
 */
export function describeAccessParts(
  rule: ProductAccessRule,
  resolveStyleName?: (id: string) => string | undefined
): { styles: string; levels: string } {
  const sa = rule.styleAccess;
  const levels = rule.allowedLevels
    ? rule.allowedLevels.join(", ")
    : "All levels";

  let styles: string;
  switch (sa.type) {
    case "all":
      styles = "All styles";
      break;
    case "fixed": {
      if (sa.styleIds.length === 0) {
        styles = "No styles (TBD)";
      } else if (isStandardMembershipStyleSet(sa.styleIds)) {
        styles = "Yoga & Kids Hip Hop";
      } else if (resolveStyleName) {
        const names = sa.styleIds
          .map(resolveStyleName)
          .filter(Boolean);
        styles =
          names.length > 0 ? names.join(", ") : `${sa.styleIds.length} style(s)`;
      } else {
        styles = `${sa.styleIds.length} fixed style(s)`;
      }
      break;
    }
    case "selected_style":
      styles = sa.allowedStyleIds
        ? `1 of ${sa.allowedStyleIds.length} styles`
        : "1 selected style";
      break;
    case "course_group":
      styles = `Pick ${sa.pickCount} of ${sa.poolStyleIds.length}`;
      break;
    case "social_only":
      styles = "Socials only";
      break;
  }

  return { styles, levels };
}

/**
 * Human-readable summary of a product's access rule (combined string).
 * When resolveStyleName is provided, fixed style lists are rendered with names.
 */
export function describeAccess(
  rule: ProductAccessRule,
  resolveStyleName?: (id: string) => string | undefined
): string {
  const { styles, levels } = describeAccessParts(rule, resolveStyleName);
  return `${styles} · ${levels}`;
}

function isStandardMembershipStyleSet(styleIds: string[]): boolean {
  if (styleIds.length !== STANDARD_MEMBERSHIP_STYLE_IDS.length) return false;
  const sorted = [...styleIds].sort();
  const expected = [...STANDARD_MEMBERSHIP_STYLE_IDS].sort();
  return sorted.every((id, i) => id === expected[i]);
}
