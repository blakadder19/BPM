/**
 * Server-side helper to build a SubscriptionProductSnapshot from a productId,
 * resolving the live product and access rule via the repository layer.
 *
 * Centralised so every subscription-creation path (catalog purchase, admin
 * manual assignment, QR drop-in sale, term renewals, dev tools) freezes the
 * exact same shape of product/rule state at purchase time.
 */

import { getProductRepo } from "@/lib/repositories";
import { buildDynamicAccessRulesMap } from "@/config/product-access";
import { getDanceStyles } from "@/lib/services/dance-style-store";
import {
  buildSubscriptionProductSnapshot,
  type SubscriptionProductSnapshot,
} from "@/lib/domain/subscription-snapshot";
import type { MockProduct } from "@/lib/mock-data";

/**
 * Build a snapshot from the live product and access rule. Returns null if the
 * product cannot be found — callers can decide whether to abort or persist
 * a null snapshot (legacy fallback).
 */
export async function buildSnapshotForProductId(
  productId: string,
): Promise<SubscriptionProductSnapshot | null> {
  const product = await getProductRepo().getById(productId);
  if (!product) return null;
  return buildSnapshotFromProduct(product);
}

/**
 * Build a snapshot when the caller already has the live MockProduct loaded.
 * Avoids an extra repo round-trip in flows that already fetched the product
 * (e.g. catalog-purchase prepare → create).
 */
export async function buildSnapshotFromProduct(
  product: MockProduct,
): Promise<SubscriptionProductSnapshot> {
  const allProducts = await getProductRepo().getAll();
  const danceStyles = getDanceStyles();
  const rulesMap = buildDynamicAccessRulesMap(
    allProducts.map((p) => ({
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
  const accessRule = rulesMap.get(product.id);
  return buildSubscriptionProductSnapshot(product, accessRule);
}
