"use server";

import { getAuthUser } from "@/lib/auth";
import { dismissStudentNotice } from "@/lib/services/class-cancellation-store";

export async function dismissStudentNoticeAction(noticeId: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  if (!user || user.role !== "student") return { success: false };
  dismissStudentNotice(noticeId);
  return { success: true };
}
