/**
 * Mutable in-memory product store, seeded from mock data.
 * In production, replace with Supabase-backed service.
 */

import { PRODUCTS, type MockProduct } from "@/lib/mock-data";

let products: MockProduct[] | null = null;

function init(): MockProduct[] {
  if (!products) {
    products = PRODUCTS.map((p) => ({ ...p }));
  }
  return products;
}

export function getProducts(): MockProduct[] {
  return init();
}

export function getProduct(id: string): MockProduct | undefined {
  return init().find((p) => p.id === id);
}

export function updateProduct(
  id: string,
  patch: Partial<
    Pick<MockProduct, "name" | "priceCents" | "totalCredits" | "durationDays" | "isActive">
  >
): MockProduct | null {
  const list = init();
  const product = list.find((p) => p.id === id);
  if (!product) return null;

  if (patch.name !== undefined) product.name = patch.name;
  if (patch.priceCents !== undefined) product.priceCents = patch.priceCents;
  if (patch.totalCredits !== undefined) product.totalCredits = patch.totalCredits;
  if (patch.durationDays !== undefined) product.durationDays = patch.durationDays;
  if (patch.isActive !== undefined) product.isActive = patch.isActive;

  return { ...product };
}
