"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createProduct,
  updateProduct,
  toggleProductActive,
  deleteProduct,
} from "@/lib/services/product-service";
import type { CreditsModel, ProductType } from "@/types/domain";

const VALID_TYPES = new Set<string>(["membership", "pass", "drop_in"]);
const VALID_CREDITS_MODELS = new Set<string>(["unlimited", "fixed", "single_use"]);

function parseOptionalInt(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

function parseMultiSelect(formData: FormData, key: string): string[] | null {
  const values = formData.getAll(key) as string[];
  const filtered = values.filter(Boolean);
  return filtered.length > 0 ? filtered : null;
}

function eurosToCents(raw: string | null): number {
  if (!raw || raw.trim() === "") return 0;
  const euros = parseFloat(raw);
  if (isNaN(euros)) return NaN;
  return Math.round(euros * 100);
}

export async function createProductAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const longDescription = (formData.get("longDescription") as string)?.trim() || null;
  const productType = formData.get("productType") as string;
  const priceCents = eurosToCents(formData.get("priceEuros") as string);
  const totalCredits = parseOptionalInt(formData.get("totalCredits") as string);
  const durationDays = parseOptionalInt(formData.get("durationDays") as string);
  const allowedStyleIds = parseMultiSelect(formData, "allowedStyleIds");
  const allowedStyleNames = parseMultiSelect(formData, "allowedStyleNames");
  const styleName = allowedStyleNames ? allowedStyleNames.join(", ") : null;
  const allowedLevels = parseMultiSelect(formData, "allowedLevels");
  const isProvisional = formData.get("isProvisional") === "on" || formData.get("isProvisional") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const validityDescription = (formData.get("validityDescription") as string)?.trim() || null;
  const creditsModel = formData.get("creditsModel") as string;
  const termBound = formData.get("termBound") === "on" || formData.get("termBound") === "true";
  const recurring = formData.get("recurring") === "on" || formData.get("recurring") === "true";
  const classesPerTerm = parseOptionalInt(formData.get("classesPerTerm") as string);

  if (!name) return { success: false, error: "Name is required" };
  if (!VALID_TYPES.has(productType)) return { success: false, error: "Invalid product type" };
  if (isNaN(priceCents) || priceCents < 0) return { success: false, error: "Invalid price" };
  if (!VALID_CREDITS_MODELS.has(creditsModel)) return { success: false, error: "Invalid credits model" };

  const result = await createProduct({
    name,
    description,
    longDescription,
    productType: productType as ProductType,
    priceCents,
    totalCredits,
    durationDays,
    styleName,
    allowedLevels,
    allowedStyleIds,
    allowedStyleNames,
    isProvisional,
    notes,
    validityDescription,
    creditsModel: creditsModel as CreditsModel,
    termBound,
    recurring,
    classesPerTerm,
  });

  if (result.success) revalidatePath("/products");
  return result;
}

export async function updateProductAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const longDescription = (formData.get("longDescription") as string)?.trim() || null;
  const productType = formData.get("productType") as string;
  const priceCents = eurosToCents(formData.get("priceEuros") as string);
  const totalCredits = parseOptionalInt(formData.get("totalCredits") as string);
  const durationDays = parseOptionalInt(formData.get("durationDays") as string);
  const allowedStyleIds = parseMultiSelect(formData, "allowedStyleIds");
  const allowedStyleNames = parseMultiSelect(formData, "allowedStyleNames");
  const styleName = allowedStyleNames ? allowedStyleNames.join(", ") : null;
  const allowedLevels = parseMultiSelect(formData, "allowedLevels");
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";
  const isProvisional = formData.get("isProvisional") === "on" || formData.get("isProvisional") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const validityDescription = (formData.get("validityDescription") as string)?.trim() || null;
  const creditsModel = formData.get("creditsModel") as string;
  const termBound = formData.get("termBound") === "on" || formData.get("termBound") === "true";
  const recurring = formData.get("recurring") === "on" || formData.get("recurring") === "true";
  const classesPerTerm = parseOptionalInt(formData.get("classesPerTerm") as string);

  if (!id) return { success: false, error: "Missing product ID" };
  if (!name) return { success: false, error: "Name is required" };
  if (!VALID_TYPES.has(productType)) return { success: false, error: "Invalid product type" };
  if (isNaN(priceCents) || priceCents < 0) return { success: false, error: "Invalid price" };
  if (!VALID_CREDITS_MODELS.has(creditsModel)) return { success: false, error: "Invalid credits model" };

  const result = await updateProduct(id, {
    name,
    description,
    longDescription,
    productType: productType as ProductType,
    priceCents,
    totalCredits,
    durationDays,
    styleName,
    allowedLevels,
    allowedStyleIds,
    allowedStyleNames,
    isActive,
    isProvisional,
    notes,
    validityDescription,
    creditsModel: creditsModel as CreditsModel,
    termBound,
    recurring,
    classesPerTerm,
  });

  if (result.success) revalidatePath("/products");
  return result;
}

export async function toggleProductActiveAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing product ID" };

  const result = await toggleProductActive(id);
  if (result.success) revalidatePath("/products");
  return result;
}

export async function deleteProductAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing product ID" };

  const result = await deleteProduct(id);
  if (result.success) {
    revalidatePath("/products");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    revalidatePath("/students");
  }
  return result;
}
