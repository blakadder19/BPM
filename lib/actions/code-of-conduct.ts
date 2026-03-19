"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { getCocRepo } from "@/lib/repositories";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";

export async function getCodeOfConductStatus(studentId: string): Promise<{
  accepted: boolean;
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
}> {
  const repo = getCocRepo();
  const acceptance = await repo.getAcceptance(studentId);
  const accepted = await repo.hasAcceptedVersion(studentId, CURRENT_CODE_OF_CONDUCT.version);
  return {
    accepted,
    currentVersion: CURRENT_CODE_OF_CONDUCT.version,
    acceptedVersion: acceptance?.acceptedVersion ?? null,
    acceptedAt: acceptance?.acceptedAt ?? null,
  };
}

export async function acceptCodeOfConductAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await getAuthUser();
  if (!user || user.role !== "student") {
    return { success: false, error: "Not authenticated as student" };
  }

  const studentId = user.id;
  if (!studentId || studentId.startsWith("dev-")) {
    return { success: false, error: "Could not resolve student identity" };
  }

  try {
    await getCocRepo().accept(studentId, CURRENT_CODE_OF_CONDUCT.version);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CoC accept] failed for", studentId, ":", msg);
    return { success: false, error: `CoC acceptance failed: ${msg}` };
  }

  revalidatePath("/classes");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");

  return { success: true };
}
