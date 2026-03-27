/**
 * Mutable in-memory product store.
 * When Supabase is configured, starts empty — hybrid repo reads from DB.
 */

import { PRODUCTS, type MockProduct } from "@/lib/mock-data";
import { generateId } from "@/lib/utils";
import type { CreditsModel, ProductType } from "@/types/domain";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const g = globalThis as unknown as {
  __bpm_products?: MockProduct[];
};

function init(): MockProduct[] {
  if (!g.__bpm_products) {
    g.__bpm_products = hasSupabaseConfig() ? [] : PRODUCTS.map((p) => ({ ...p }));
  }
  return g.__bpm_products;
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
  longDescription?: string | null;
  productType: ProductType;
  priceCents: number;
  totalCredits: number | null;
  durationDays: number | null;
  styleName: string | null;
  allowedLevels: string[] | null;
  allowedStyleIds?: string[] | null;
  allowedStyleNames?: string[] | null;
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
}): MockProduct {
  const list = init();
  const product: MockProduct = {
    id: generateId("p"),
    name: data.name,
    description: data.description,
    longDescription: data.longDescription ?? null,
    productType: data.productType,
    priceCents: data.priceCents,
    totalCredits: data.totalCredits,
    durationDays: data.durationDays,
    styleName: data.styleName,
    allowedLevels: data.allowedLevels,
    allowedStyleIds: data.allowedStyleIds ?? null,
    allowedStyleNames: data.allowedStyleNames ?? null,
    isActive: true,
    isProvisional: data.isProvisional,
    notes: data.notes,
    validityDescription: data.validityDescription,
    creditsModel: data.creditsModel,
    termBound: data.termBound ?? false,
    recurring: data.recurring ?? false,
    classesPerTerm: data.classesPerTerm ?? null,
    autoRenew: data.autoRenew ?? false,
    benefits: data.benefits ?? null,
    spanTerms: data.spanTerms ?? null,
  };
  list.push(product);
  return product;
}

type ProductPatch = Partial<
  Pick<
    MockProduct,
    | "name"
    | "description"
    | "longDescription"
    | "productType"
    | "priceCents"
    | "totalCredits"
    | "durationDays"
    | "styleName"
    | "allowedLevels"
    | "allowedStyleIds"
    | "allowedStyleNames"
    | "isActive"
    | "isProvisional"
    | "notes"
    | "validityDescription"
    | "creditsModel"
    | "termBound"
    | "recurring"
    | "classesPerTerm"
    | "autoRenew"
    | "benefits"
    | "spanTerms"
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
  if (patch.longDescription !== undefined) product.longDescription = patch.longDescription;
  if (patch.productType !== undefined) product.productType = patch.productType;
  if (patch.priceCents !== undefined) product.priceCents = patch.priceCents;
  if (patch.totalCredits !== undefined) product.totalCredits = patch.totalCredits;
  if (patch.durationDays !== undefined) product.durationDays = patch.durationDays;
  if (patch.styleName !== undefined) product.styleName = patch.styleName;
  if (patch.allowedLevels !== undefined) product.allowedLevels = patch.allowedLevels;
  if (patch.allowedStyleIds !== undefined) product.allowedStyleIds = patch.allowedStyleIds;
  if (patch.allowedStyleNames !== undefined) product.allowedStyleNames = patch.allowedStyleNames;
  if (patch.isActive !== undefined) product.isActive = patch.isActive;
  if (patch.isProvisional !== undefined) product.isProvisional = patch.isProvisional;
  if (patch.notes !== undefined) product.notes = patch.notes;
  if (patch.validityDescription !== undefined) product.validityDescription = patch.validityDescription;
  if (patch.creditsModel !== undefined) product.creditsModel = patch.creditsModel;
  if (patch.termBound !== undefined) product.termBound = patch.termBound;
  if (patch.recurring !== undefined) product.recurring = patch.recurring;
  if (patch.classesPerTerm !== undefined) product.classesPerTerm = patch.classesPerTerm;
  if (patch.autoRenew !== undefined) product.autoRenew = patch.autoRenew;
  if (patch.benefits !== undefined) product.benefits = patch.benefits;
  if (patch.spanTerms !== undefined) product.spanTerms = patch.spanTerms;

  return { ...product };
}

export function toggleProductActive(id: string): MockProduct | null {
  const list = init();
  const product = list.find((p) => p.id === id);
  if (!product) return null;
  product.isActive = !product.isActive;
  return { ...product };
}

export function deleteProduct(id: string): boolean {
  const list = init();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}
