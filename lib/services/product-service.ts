/**
 * Product service — delegates to the repository selected by DATA_PROVIDER.
 */

import { getProductRepo } from "@/lib/repositories";
import type { MockProduct } from "@/lib/mock-data";
import type { CreditsModel, ProductType } from "@/types/domain";

export async function getProducts(): Promise<MockProduct[]> {
  return getProductRepo().getAll();
}

export async function getProduct(id: string): Promise<MockProduct | null> {
  return getProductRepo().getById(id);
}

export async function createProduct(data: {
  name: string;
  description: string;
  longDescription?: string | null;
  productType: ProductType;
  priceCents: number;
  totalCredits: number | null;
  durationDays: number | null;
  styleName: string | null;
  allowedLevels: string[] | null;
  allowedStyleIds: string[] | null;
  allowedStyleNames: string[] | null;
  isProvisional: boolean;
  notes: string | null;
  validityDescription: string | null;
  creditsModel: CreditsModel;
  termBound?: boolean;
  recurring?: boolean;
  classesPerTerm?: number | null;
  autoRenew?: boolean;
  benefits?: string[] | null;
  spanTerms?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await getProductRepo().create(data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updateProduct(
  id: string,
  patch: {
    name?: string;
    description?: string;
    longDescription?: string | null;
    productType?: ProductType;
    priceCents?: number;
    totalCredits?: number | null;
    durationDays?: number | null;
    styleName?: string | null;
    allowedLevels?: string[] | null;
    allowedStyleIds?: string[] | null;
    allowedStyleNames?: string[] | null;
    isActive?: boolean;
    isProvisional?: boolean;
    notes?: string | null;
    validityDescription?: string | null;
    creditsModel?: CreditsModel;
    termBound?: boolean;
    recurring?: boolean;
    classesPerTerm?: number | null;
    autoRenew?: boolean;
    benefits?: string[] | null;
    spanTerms?: number | null;
  }
): Promise<{ success: boolean; error?: string }> {
  const result = await getProductRepo().update(id, patch);
  return result
    ? { success: true }
    : { success: false, error: "Product not found" };
}

export async function toggleProductActive(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const result = await getProductRepo().toggleActive(id);
  return result
    ? { success: true }
    : { success: false, error: "Product not found" };
}

export async function deleteProduct(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const deleted = await getProductRepo().delete(id);
    return deleted
      ? { success: true }
      : { success: false, error: "Product not found" };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
