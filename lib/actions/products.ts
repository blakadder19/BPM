"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import type { Permission } from "@/lib/domain/permissions";

/**
 * Local helper: gate a product mutation behind a permission AND fall
 * back to the legacy admin role check for super-admins/admins that
 * have not yet been assigned permissions explicitly. requirePermission
 * already auto-grants legacy admins via the super_admin fallback in
 * lib/staff-permissions.ts, so this is mainly a uniform action shape.
 */
async function gateProduct(perm: Permission): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await requirePermissionForAction(perm);
  if (!g.ok) return { ok: false, error: g.error };
  return { ok: true };
}
import {
  createProduct,
  updateProduct,
  toggleProductActive,
  deleteProduct,
} from "@/lib/services/product-service";
import type { ProductPerks } from "@/lib/mock-data";
import type { StyleAccessMode } from "@/lib/domain/subscription-snapshot";
import type { ClassType, CreditsModel, ProductType } from "@/types/domain";
import { updateProduct as serviceUpdateProduct } from "@/lib/services/product-service";

const VALID_TYPES = new Set<string>(["membership", "pass", "drop_in"]);
const VALID_CREDITS_MODELS = new Set<string>(["unlimited", "fixed", "single_use"]);
const VALID_STYLE_ACCESS_MODES = new Set<StyleAccessMode>([
  "all",
  "fixed",
  "selected_style",
  "course_group",
  "social_only",
]);
const VALID_CLASS_TYPES = new Set<ClassType>(["class", "social", "student_practice"]);

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

/**
 * Parse a multi-line textarea into a non-empty list of strings.
 * Returns null when the textarea is empty so the column stays NULL
 * rather than persisting an empty array.
 */
function parseLineList(raw: string | null): string[] | null {
  if (!raw) return null;
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : null;
}

/**
 * Parse the structured perk checkboxes the editor exposes for memberships.
 * Returns null when the form did not include any perk markers, preserving
 * legacy NULL semantics (productType-derived defaults). Only collected for
 * memberships — the editor hides these inputs for non-membership types.
 */
function parsePerks(formData: FormData): ProductPerks | null {
  const marker = formData.get("perksProvided");
  if (marker !== "1") return null;
  const get = (key: string): boolean =>
    formData.get(key) === "on" || formData.get(key) === "true";
  return {
    birthdayFreeClass: get("perkBirthdayFreeClass"),
    freeWeekendPractice: get("perkFreeWeekendPractice"),
    memberGiveaway: get("perkMemberGiveaway"),
  };
}

/**
 * Parse the structured Phase 3 fields. The hidden `structuredProvided` marker
 * tells us whether the form intends to drive these explicitly (set by the
 * editor) vs. legacy callers (left untouched → null = derive at runtime).
 */
function parseStyleAccessMode(formData: FormData): StyleAccessMode | null {
  if (formData.get("structuredProvided") !== "1") return null;
  const raw = (formData.get("styleAccessMode") as string | null)?.trim();
  if (!raw) return null;
  return VALID_STYLE_ACCESS_MODES.has(raw as StyleAccessMode)
    ? (raw as StyleAccessMode)
    : null;
}

function parseStyleAccessPickCount(
  formData: FormData,
  mode: StyleAccessMode | null,
): number | null {
  if (mode !== "course_group") return null;
  const raw = formData.get("styleAccessPickCount") as string | null;
  const n = parseOptionalInt(raw);
  if (n === null) return null;
  return n > 0 ? n : null;
}

function parseAllowedClassTypes(formData: FormData): ClassType[] | null {
  if (formData.get("structuredProvided") !== "1") return null;
  const values = parseMultiSelect(formData, "allowedClassTypes");
  if (!values) return null;
  const filtered = values.filter((v): v is ClassType =>
    VALID_CLASS_TYPES.has(v as ClassType),
  );
  return filtered.length > 0 ? filtered : null;
}

function parseStripePriceId(formData: FormData): string | null {
  const raw = (formData.get("stripePriceId") as string | null)?.trim();
  return raw ? raw : null;
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
  const g = await gateProduct("products:create");
  if (!g.ok) return { success: false, error: g.error };
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
  const autoRenew = formData.get("autoRenew") === "on" || formData.get("autoRenew") === "true";
  const classesPerTerm = parseOptionalInt(formData.get("classesPerTerm") as string);
  const spanTerms = parseOptionalInt(formData.get("spanTerms") as string);
  const benefits = parseLineList(formData.get("benefits") as string);
  const perks = parsePerks(formData);
  const styleAccessMode = parseStyleAccessMode(formData);
  const styleAccessPickCount = parseStyleAccessPickCount(formData, styleAccessMode);
  const allowedClassTypes = parseAllowedClassTypes(formData);
  const stripePriceId = parseStripePriceId(formData);

  if (!name) return { success: false, error: "Name is required" };
  if (!VALID_TYPES.has(productType)) return { success: false, error: "Invalid product type" };
  if (isNaN(priceCents) || priceCents < 0) return { success: false, error: "Invalid price" };
  if (!VALID_CREDITS_MODELS.has(creditsModel)) return { success: false, error: "Invalid credits model" };
  if (
    styleAccessMode === "course_group" &&
    (!styleAccessPickCount ||
      (allowedStyleIds && styleAccessPickCount > allowedStyleIds.length))
  ) {
    return {
      success: false,
      error: "Pick count must be between 1 and the number of allowed styles for course_group mode.",
    };
  }

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
    autoRenew,
    classesPerTerm,
    spanTerms,
    benefits,
    perks,
    styleAccessMode,
    styleAccessPickCount,
    allowedClassTypes,
    stripePriceId,
  });

  if (result.success) {
    revalidatePath("/products");
    revalidatePath("/catalog");
  }
  return result;
}

export async function updateProductAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const g = await gateProduct("products:edit");
  if (!g.ok) return { success: false, error: g.error };
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
  const autoRenew = formData.get("autoRenew") === "on" || formData.get("autoRenew") === "true";
  const classesPerTerm = parseOptionalInt(formData.get("classesPerTerm") as string);
  const spanTerms = parseOptionalInt(formData.get("spanTerms") as string);
  const benefits = parseLineList(formData.get("benefits") as string);
  const perks = parsePerks(formData);
  const styleAccessMode = parseStyleAccessMode(formData);
  const styleAccessPickCount = parseStyleAccessPickCount(formData, styleAccessMode);
  const allowedClassTypes = parseAllowedClassTypes(formData);
  const stripePriceId = parseStripePriceId(formData);

  if (!id) return { success: false, error: "Missing product ID" };
  if (!name) return { success: false, error: "Name is required" };
  if (!VALID_TYPES.has(productType)) return { success: false, error: "Invalid product type" };
  if (isNaN(priceCents) || priceCents < 0) return { success: false, error: "Invalid price" };
  if (!VALID_CREDITS_MODELS.has(creditsModel)) return { success: false, error: "Invalid credits model" };
  if (
    styleAccessMode === "course_group" &&
    (!styleAccessPickCount ||
      (allowedStyleIds && styleAccessPickCount > allowedStyleIds.length))
  ) {
    return {
      success: false,
      error: "Pick count must be between 1 and the number of allowed styles for course_group mode.",
    };
  }

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
    autoRenew,
    classesPerTerm,
    spanTerms,
    benefits,
    perks,
    styleAccessMode,
    styleAccessPickCount,
    allowedClassTypes,
    stripePriceId,
  });

  if (result.success) {
    revalidatePath("/products");
    revalidatePath("/catalog");
  }
  return result;
}

/**
 * Archive a product. Soft archival: sets archivedAt to now and forces
 * isActive=false so the product disappears from the catalog and from new
 * subscription flows. Historical subscriptions keep working via the Phase 1
 * snapshot. Reversible with `unarchiveProductAction`.
 */
export async function archiveProductAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const g = await gateProduct("products:archive");
  if (!g.ok) return { success: false, error: g.error };
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing product ID" };

  const result = await serviceUpdateProduct(id, {
    archivedAt: new Date().toISOString(),
    isActive: false,
  });
  if (result.success) {
    revalidatePath("/products");
    revalidatePath("/catalog");
  }
  return result;
}

/**
 * Unarchive a product. Clears archivedAt. Leaves isActive at its current
 * (false) value so admin can deliberately reactivate via the standard toggle.
 */
export async function unarchiveProductAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const g = await gateProduct("products:archive");
  if (!g.ok) return { success: false, error: g.error };
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing product ID" };

  const result = await serviceUpdateProduct(id, { archivedAt: null });
  if (result.success) {
    revalidatePath("/products");
    revalidatePath("/catalog");
  }
  return result;
}

export async function toggleProductActiveAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const g = await gateProduct("products:edit");
  if (!g.ok) return { success: false, error: g.error };
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing product ID" };

  const result = await toggleProductActive(id);
  if (result.success) revalidatePath("/products");
  return result;
}

export async function deleteProductAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const g = await gateProduct("products:delete");
  if (!g.ok) return { success: false, error: g.error };
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
