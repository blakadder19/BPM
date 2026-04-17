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
  | "classes"
  | "dashboard"
  | "external_url";

export interface CtaDestination {
  type: CtaDestinationType;
  /** Target entity ID — required for product/event, unused for others */
  targetId?: string | null;
  /** Only used when type === "external_url" */
  externalUrl?: string | null;
}

export const CTA_DESTINATION_LABELS: Record<CtaDestinationType, string> = {
  product: "Product page",
  event: "Event page",
  classes: "Classes page",
  dashboard: "Student dashboard",
  external_url: "External URL",
};

/**
 * Resolve a CTA destination to a relative in-app path.
 * Returns null if the destination cannot be resolved.
 */
export function resolveCtaPath(dest: CtaDestination): string | null {
  switch (dest.type) {
    case "product":
      return dest.targetId ? `/catalog` : "/catalog";
    case "event":
      return dest.targetId ? `/events/${dest.targetId}` : "/events";
    case "classes":
      return "/classes";
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
