/**
 * Structured CTA destination model for broadcasts.
 *
 * Instead of requiring admins to paste raw URLs, the system stores
 * a destination type + optional target ID, then resolves the URL
 * at render time (relative for in-app, absolute for email).
 */

export type CtaDestinationType =
  | "product"
  | "event"
  | "browse_classes"
  | "class"
  | "dashboard"
  | "external_url"
  // Legacy alias — kept so older DB rows still resolve correctly
  | "classes";

export interface CtaDestination {
  type: CtaDestinationType;
  /** Target entity ID — required for product/event/class, unused for others */
  targetId?: string | null;
  /** Only used when type === "external_url" */
  externalUrl?: string | null;
}

export const CTA_DESTINATION_LABELS: Record<CtaDestinationType, string> = {
  product: "Product page",
  event: "Event page",
  browse_classes: "Browse classes",
  class: "Specific class",
  dashboard: "Student dashboard",
  external_url: "External URL",
  classes: "Browse classes",
};

export const CTA_DESTINATION_DESCRIPTIONS: Record<CtaDestinationType, string> = {
  product: "Opens the catalog so the student can view or purchase a product.",
  event: "Opens a specific event page with tickets and details.",
  browse_classes: "Opens the student classes page to browse all upcoming classes.",
  class: "Opens the classes page and highlights the next upcoming instance of a specific class.",
  dashboard: "Opens the student home/account area for general updates.",
  external_url: "Links to any external website or resource.",
  classes: "Opens the student classes page to browse all upcoming classes.",
};

/**
 * Resolve a CTA destination to a relative in-app path.
 * Returns null if the destination cannot be resolved.
 */
export function resolveCtaPath(dest: CtaDestination): string | null {
  switch (dest.type) {
    case "product":
      return "/catalog";
    case "event":
      return dest.targetId ? `/events/${dest.targetId}` : "/events";
    case "browse_classes":
    case "classes":
      return "/classes";
    case "class":
      return dest.targetId ? `/classes?highlight=${dest.targetId}` : "/classes";
    case "dashboard":
      return "/dashboard";
    case "external_url":
      return dest.externalUrl || null;
    default:
      return "/dashboard";
  }
}

/**
 * Resolve a CTA destination to an absolute URL (for emails).
 */
export function resolveCtaAbsoluteUrl(
  dest: CtaDestination,
  appBaseUrl: string,
): string | null {
  if (dest.type === "external_url") {
    return dest.externalUrl || null;
  }
  const path = resolveCtaPath(dest);
  if (!path) return null;
  return `${appBaseUrl}${path}`;
}

/**
 * Backward-compatible: build a CtaDestination from a raw ctaUrl
 * string (used by older broadcasts that pre-date structured CTA).
 */
export function ctaDestinationFromLegacyUrl(url: string): CtaDestination {
  return { type: "external_url", externalUrl: url };
}
