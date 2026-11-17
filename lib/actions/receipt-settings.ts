"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import { updateReceiptBusinessSettings } from "@/lib/services/settings-store";
import {
  normalizeReceiptBusinessSettings,
  type ReceiptBusinessField,
  type ReceiptBusinessSettings,
} from "@/lib/domain/receipt-settings";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

const receiptBusinessSchema = z.object({
  legalName: optionalText(200),
  tradingName: optionalText(200),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(200),
  postcode: optionalText(200),
  country: optionalText(200),
  contactEmail: optionalText(200).refine((v) => v === "" || z.email().safeParse(v).success, {
    message: "Contact email is not a valid email address.",
  }),
  phone: optionalText(200),
  companyNumber: optionalText(200),
  vatNumber: optionalText(200),
  website: optionalText(200).refine((v) => v === "" || /^(https?:\/\/)?[^\s/$.?#]+\.[^\s]+$/i.test(v), {
    message: "Website must be a web address, e.g. https://www.example.com",
  }),
  footerNote: optionalText(500),
});

export type SaveReceiptBusinessResult =
  | { success: true; settings: ReceiptBusinessSettings }
  | { success: false; error: string };

/** Business details printed on Payment Receipts. Blank fields are stored as "not configured". */
export async function saveReceiptBusinessSettingsAction(
  input: Partial<Record<ReceiptBusinessField, string>>,
): Promise<SaveReceiptBusinessResult> {
  const guard = await requirePermissionForAction("settings:edit");
  if (!guard.ok) return { success: false, error: guard.error };

  const parsed = receiptBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid receipt details." };
  }

  const settings = normalizeReceiptBusinessSettings(parsed.data);
  const saved = await updateReceiptBusinessSettings(settings);
  if (!saved.ok) return { success: false, error: saved.error };

  revalidatePath("/settings");
  return { success: true, settings };
}
