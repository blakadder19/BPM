"use server";

import { getAuthUser } from "@/lib/auth";
import { dismissStudentNotice } from "@/lib/services/class-cancellation-store";
import { dismissNotification } from "@/lib/communications/notification-store";
import { isRealUser } from "@/lib/utils/is-real-user";

export async function dismissStudentNoticeAction(noticeId: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  if (!user || user.role !== "student") return { success: false };
  dismissStudentNotice(noticeId, user.id);
  if (isRealUser(user.id)) {
    await dismissNotification(noticeId, user.id);
  }
  return { success: true };
}
