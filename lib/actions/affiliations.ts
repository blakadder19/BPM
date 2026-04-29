"use server";

import { revalidatePath } from "next/cache";
import { requirePermissionForAction } from "@/lib/staff-permissions";
import { getAffiliationRepo } from "@/lib/repositories";
import {
  AFFILIATION_TYPES,
  AFFILIATION_VERIFICATION_STATUSES,
  type AffiliationType,
  type AffiliationVerificationStatus,
} from "@/lib/domain/pricing-engine";

const AFFILIATION_TYPE_SET = new Set<string>(AFFILIATION_TYPES);
const VERIFICATION_STATUS_SET = new Set<string>(AFFILIATION_VERIFICATION_STATUSES);

function parseMetadataString(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const k = trimmed.slice(0, sep).trim();
    const v = trimmed.slice(sep + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export async function createAffiliationAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const g = await requirePermissionForAction("affiliations:create");
  if (!g.ok) return { success: false, error: g.error };
  const admin = g.access.user;
  const studentId = (formData.get("studentId") as string)?.trim();
  const affiliationType = (formData.get("affiliationType") as string)?.trim();
  const verificationStatus = (formData.get("verificationStatus") as string)?.trim() || "pending";
  const validFrom = (formData.get("validFrom") as string)?.trim() || null;
  const validUntil = (formData.get("validUntil") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const metadata = parseMetadataString((formData.get("metadata") as string) || null);

  if (!studentId) return { success: false, error: "Missing student ID" };
  if (!AFFILIATION_TYPE_SET.has(affiliationType)) {
    return { success: false, error: "Invalid affiliation type" };
  }
  if (!VERIFICATION_STATUS_SET.has(verificationStatus)) {
    return { success: false, error: "Invalid verification status" };
  }

  try {
    await getAffiliationRepo().create({
      studentId,
      affiliationType: affiliationType as AffiliationType,
      verificationStatus: verificationStatus as AffiliationVerificationStatus,
      verifiedAt: verificationStatus === "verified" ? new Date().toISOString() : null,
      verifiedBy: verificationStatus === "verified" ? admin.id : null,
      metadata,
      validFrom,
      validUntil,
      notes,
    });
    revalidatePath("/students");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updateAffiliationStatusAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const g = await requirePermissionForAction("affiliations:verify");
  if (!g.ok) return { success: false, error: g.error };
  const admin = g.access.user;
  const id = (formData.get("id") as string)?.trim();
  const status = (formData.get("verificationStatus") as string)?.trim();

  if (!id) return { success: false, error: "Missing affiliation ID" };
  if (!VERIFICATION_STATUS_SET.has(status)) {
    return { success: false, error: "Invalid verification status" };
  }

  try {
    const result = await getAffiliationRepo().update(id, {
      verificationStatus: status as AffiliationVerificationStatus,
      verifiedAt: status === "verified" ? new Date().toISOString() : null,
      verifiedBy: status === "verified" ? admin.id : null,
    });
    if (!result) return { success: false, error: "Affiliation not found" };
    revalidatePath("/students");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function deleteAffiliationAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const g = await requirePermissionForAction("affiliations:delete");
  if (!g.ok) return { success: false, error: g.error };
  const id = (formData.get("id") as string)?.trim();
  if (!id) return { success: false, error: "Missing affiliation ID" };

  try {
    await getAffiliationRepo().delete(id);
    revalidatePath("/students");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
