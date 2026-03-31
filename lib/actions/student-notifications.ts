"use server";

import { getAuthUser } from "@/lib/auth";
import { dismissStudentNotice } from "@/lib/services/class-cancellation-store";
import { dismissNotificationFromDB } from "@/lib/supabase/notification-persistence";
import { isRealUser } from "@/lib/utils/is-real-user";

export async function dismissStudentNoticeAction(noticeId: string): Promise<{ success: boolean }> {
  const user = await getAuthUser();
  if (!user || user.role !== "student") return { success: false };
  dismissStudentNotice(noticeId);
  if (isRealUser(user.id)) {
    await dismissNotificationFromDB(noticeId);
  }
  return { success: true };
}
