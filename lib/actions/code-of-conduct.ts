"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/auth";
import { CURRENT_CODE_OF_CONDUCT } from "@/config/code-of-conduct";
import {
  acceptCoc,
  getCocAcceptance,
  hasAcceptedCurrentVersion,
} from "@/lib/services/coc-store";

export async function getCodeOfConductStatus(studentId: string): Promise<{
  accepted: boolean;
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedAt: string | null;
}> {
  const acceptance = getCocAcceptance(studentId);
  return {
    accepted: hasAcceptedCurrentVersion(studentId, CURRENT_CODE_OF_CONDUCT.version),
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

  acceptCoc(studentId, CURRENT_CODE_OF_CONDUCT.version);

  revalidatePath("/classes");
  revalidatePath("/bookings");
  revalidatePath("/dashboard");

  return { success: true };
}
