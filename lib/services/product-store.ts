/**
 * Mutable in-memory product store, seeded from mock data.
 * In production, replace with Supabase-backed service.
 */

import { PRODUCTS, type MockProduct } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { CreditsModel, ProductType } from "@/types/domain";

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

export function createProduct(data: {
  name: string;
  description: string;
  productType: ProductType;
  priceCents: number;
  totalCredits: number | null;
  durationDays: number | null;
  styleName: string | null;
  allowedLevels: string[] | null;
  isProvisional: boolean;
  notes: string | null;
  validityDescription: string | null;
  creditsModel: CreditsModel;
}): MockProduct {
  const list = init();
  const product: MockProduct = {
    id: generateId("p"),
    name: data.name,
    description: data.description,
    productType: data.productType,
    priceCents: data.priceCents,
    totalCredits: data.totalCredits,
    durationDays: data.durationDays,
    styleName: data.styleName,
    allowedLevels: data.allowedLevels,
    isActive: true,
    isProvisional: data.isProvisional,
    notes: data.notes,
    validityDescription: data.validityDescription,
    creditsModel: data.creditsModel,
  };
  list.push(product);
  return product;
}

type ProductPatch = Partial<
  Pick<
    MockProduct,
    | "name"
    | "description"
    | "productType"
    | "priceCents"
    | "totalCredits"
    | "durationDays"
    | "styleName"
    | "allowedLevels"
    | "isActive"
    | "isProvisional"
    | "notes"
    | "validityDescription"
    | "creditsModel"
  >
>;

export function updateProduct(
  id: string,
  patch: ProductPatch
): MockProduct | null {
  const list = init();
  const product = list.find((p) => p.id === id);
  if (!product) return null;

  if (patch.name !== undefined) product.name = patch.name;
  if (patch.description !== undefined) product.description = patch.description;
  if (patch.productType !== undefined) product.productType = patch.productType;
  if (patch.priceCents !== undefined) product.priceCents = patch.priceCents;
  if (patch.totalCredits !== undefined) product.totalCredits = patch.totalCredits;
  if (patch.durationDays !== undefined) product.durationDays = patch.durationDays;
  if (patch.styleName !== undefined) product.styleName = patch.styleName;
  if (patch.allowedLevels !== undefined) product.allowedLevels = patch.allowedLevels;
  if (patch.isActive !== undefined) product.isActive = patch.isActive;
  if (patch.isProvisional !== undefined) product.isProvisional = patch.isProvisional;
  if (patch.notes !== undefined) product.notes = patch.notes;
  if (patch.validityDescription !== undefined) product.validityDescription = patch.validityDescription;
  if (patch.creditsModel !== undefined) product.creditsModel = patch.creditsModel;

  return { ...product };
}

export function toggleProductActive(id: string): MockProduct | null {
  const list = init();
  const product = list.find((p) => p.id === id);
  if (!product) return null;
  product.isActive = !product.isActive;
  return { ...product };
}
