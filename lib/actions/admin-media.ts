"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getAcademyId } from "@/lib/supabase/academy";
import {
  uploadMediaImage,
  listMediaImages,
  deleteMediaImage,
  type MediaItem,
} from "@/lib/services/admin-media-storage";

export type { MediaItem };

export async function uploadMediaAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string; item?: MediaItem }> {
  const user = await requireRole(["admin"]);
  const academyId = await getAcademyId();

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, error: "No file provided." };
  }

  const kind = (formData.get("kind") as string) || "general";
  const title = (formData.get("title") as string) || undefined;

  const result = await uploadMediaImage(academyId, file, {
    kind,
    title,
    uploadedBy: user.fullName,
  });

  if ("error" in result) {
    return { success: false, error: result.error };
  }

  revalidatePath("/broadcasts");
  return { success: true, item: result.item };
}

export async function listMediaAction(
  kind?: string,
): Promise<MediaItem[]> {
  await requireRole(["admin"]);
  const academyId = await getAcademyId();
  return listMediaImages(academyId, kind);
}

export async function deleteMediaAction(
  mediaId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const result = await deleteMediaImage(mediaId);
  if (result.success) {
    revalidatePath("/broadcasts");
  }
  return result;
}
