"use server";

import { getPenaltyService } from "@/lib/services/penalty-store";
import type { PenaltyResolution } from "@/types/domain";

export async function updatePenaltyResolution(
  penaltyId: string,
  resolution: PenaltyResolution
): Promise<{ success: boolean; error?: string }> {
  if (!penaltyId) return { success: false, error: "Missing penalty ID" };

  const allowed: PenaltyResolution[] = ["credit_deducted", "waived", "monetary_pending"];
  if (!allowed.includes(resolution)) {
    return { success: false, error: "Invalid resolution" };
  }

  const svc = getPenaltyService();
  const updated = svc.updateResolution(penaltyId, resolution);

  if (!updated) return { success: false, error: "Penalty not found" };
  return { success: true };
}
