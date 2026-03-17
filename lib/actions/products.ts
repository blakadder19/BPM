"use server";

import { updateProduct } from "@/lib/services/product-store";

export async function updateProductAction(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const id = formData.get("id") as string;
  const name = (formData.get("name") as string)?.trim();
  const priceCents = Number(formData.get("priceCents"));
  const totalCreditsRaw = formData.get("totalCredits") as string;
  const totalCredits = totalCreditsRaw === "" ? null : Number(totalCreditsRaw);
  const durationDaysRaw = formData.get("durationDays") as string;
  const durationDays = durationDaysRaw === "" ? null : Number(durationDaysRaw);
  const isActive = formData.get("isActive") === "on";

  if (!id) return { success: false, error: "Missing product ID" };
  if (!name) return { success: false, error: "Name is required" };
  if (isNaN(priceCents) || priceCents < 0) {
    return { success: false, error: "Invalid price" };
  }

  const updated = updateProduct(id, {
    name,
    priceCents,
    totalCredits,
    durationDays,
    isActive,
  });

  if (!updated) return { success: false, error: "Product not found" };
  return { success: true };
}
