"use server";

import { revalidatePath } from "next/cache";
import {
  createProduct,
  updateProduct,
  toggleProductActive,
} from "@/lib/services/product-service";
import type { CreditsModel, ProductType } from "@/types/domain";

const VALID_TYPES = new Set<string>(["membership", "pass", "drop_in"]);
const VALID_CREDITS_MODELS = new Set<string>(["unlimited", "fixed", "single_use"]);

function parseOptionalInt(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

function parseLevels(raw: string | null): string[] | null {
  if (!raw || raw.trim() === "") return null;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function createProductAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const longDescription = (formData.get("longDescription") as string)?.trim() || null;
  const productType = formData.get("productType") as string;
  const priceCents = Number(formData.get("priceCents"));
  const totalCredits = parseOptionalInt(formData.get("totalCredits") as string);
  const durationDays = parseOptionalInt(formData.get("durationDays") as string);
  const styleName = (formData.get("styleName") as string)?.trim() || null;
  const allowedLevels = parseLevels(formData.get("allowedLevels") as string);
  const isProvisional = formData.get("isProvisional") === "on" || formData.get("isProvisional") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const validityDescription = (formData.get("validityDescription") as string)?.trim() || null;
  const creditsModel = formData.get("creditsModel") as string;

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
    isProvisional,
    notes,
    validityDescription,
    creditsModel: creditsModel as CreditsModel,
  });

  if (result.success) revalidatePath("/products");
  return result;
}

export async function updateProductAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const longDescription = (formData.get("longDescription") as string)?.trim() || null;
  const productType = formData.get("productType") as string;
  const priceCents = Number(formData.get("priceCents"));
  const totalCredits = parseOptionalInt(formData.get("totalCredits") as string);
  const durationDays = parseOptionalInt(formData.get("durationDays") as string);
  const styleName = (formData.get("styleName") as string)?.trim() || null;
  const allowedLevels = parseLevels(formData.get("allowedLevels") as string);
  const isActive = formData.get("isActive") === "on" || formData.get("isActive") === "true";
  const isProvisional = formData.get("isProvisional") === "on" || formData.get("isProvisional") === "true";
  const notes = (formData.get("notes") as string)?.trim() || null;
  const validityDescription = (formData.get("validityDescription") as string)?.trim() || null;
  const creditsModel = formData.get("creditsModel") as string;

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
    isActive,
    isProvisional,
    notes,
    validityDescription,
    creditsModel: creditsModel as CreditsModel,
  });

  if (result.success) revalidatePath("/products");
  return result;
}

export async function toggleProductActiveAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing product ID" };

  const result = await toggleProductActive(id);
  if (result.success) revalidatePath("/products");
  return result;
}
