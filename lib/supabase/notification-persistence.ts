import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { ClassCancellationNotice } from "@/lib/services/class-cancellation-store";

const TABLE = "student_notifications";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function saveNotificationsToDB(
  notices: ClassCancellationNotice[]
): Promise<void> {
  if (notices.length === 0) return;
  const client = getClient();
  if (!client) return;

  const rows = notices.map((n) => ({
    id: n.id,
    student_id: n.studentId,
    student_name: n.studentName,
    type: "class_cancelled",
    class_title: n.classTitle,
    class_date: n.classDate,
    start_time: n.startTime,
    credit_reverted: n.creditReverted,
    created_at: n.createdAt,
  }));

  try {
    const { error } = await client.from(TABLE).upsert(rows, { onConflict: "id" });
    if (error) console.warn("[notification-persistence] save:", error.message);
  } catch (e) {
    console.warn("[notification-persistence] save error:", e instanceof Error ? e.message : e);
  }
}

export async function getNotificationsForStudentFromDB(
  studentId: string
): Promise<ClassCancellationNotice[]> {
  const client = getClient();
  if (!client) return [];

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("student_id", studentId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[notification-persistence] fetch:", error.message);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => ({
      id: r.id as string,
      studentId: r.student_id as string,
      studentName: r.student_name as string,
      classTitle: r.class_title as string,
      classDate: r.class_date as string,
      startTime: r.start_time as string,
      creditReverted: !!r.credit_reverted,
      createdAt: r.created_at as string,
    }));
  } catch (e) {
    console.warn("[notification-persistence] fetch error:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function dismissNotificationFromDB(
  noticeId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from(TABLE).delete().eq("id", noticeId);
    if (error) console.warn("[notification-persistence] dismiss:", error.message);
  } catch (e) {
    console.warn("[notification-persistence] dismiss error:", e instanceof Error ? e.message : e);
  }
}

export async function dismissAllNotificationsForStudentFromDB(
  studentId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client.from(TABLE).delete().eq("student_id", studentId);
    if (error) console.warn("[notification-persistence] dismiss-all:", error.message);
  } catch (e) {
    console.warn("[notification-persistence] dismiss-all error:", e instanceof Error ? e.message : e);
  }
}
