import "server-only";

/**
 * Generic notification persistence for the student_notifications table.
 *
 * Replaces the old class-cancellation-specific persistence with a
 * generic JSON-payload approach that supports all CommEventTypes.
 *
 * Schema uses the new `payload` JSONB column added by migration 00030.
 * The legacy columns (class_title, class_date, etc.) are kept populated
 * for class_cancelled events to maintain backward compatibility.
 */

import { createClient } from "@supabase/supabase-js";
import type { CommEvent, CommEventType, CommEventPayloadMap } from "./events";
import type { ClassCancelledPayload } from "./events";

const TABLE = "student_notifications";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cachedClient: any = null;

function getClient() {
  if (_cachedClient) return _cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _cachedClient;
}

// ── Write ────────────────────────────────────────────────────

export async function saveGenericNotificationToDB(
  event: CommEvent
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const isClassCancelled = event.type === "class_cancelled";
  const ccPayload = isClassCancelled
    ? (event.payload as ClassCancelledPayload)
    : null;

  // For admin_broadcast, extract title/body for redundant storage
  // in legacy columns so the data survives even if JSONB payload
  // is lost (e.g. column not yet migrated, schema-cache lag).
  const isBroadcast = event.type === "admin_broadcast";
  const bcPayload = isBroadcast
    ? (event.payload as { title?: string; body?: string })
    : null;

  // Ensure payload is a plain object for JSONB serialization.
  // Supabase JS normally handles this, but guard against edge cases
  // where the payload might already be stringified or null.
  let safePayload: Record<string, unknown>;
  if (typeof event.payload === "string") {
    try {
      safePayload = JSON.parse(event.payload as string);
    } catch {
      safePayload = {};
    }
  } else if (event.payload == null) {
    safePayload = {};
  } else {
    safePayload = { ...(event.payload as unknown as Record<string, unknown>) };
  }

  const row = {
    id: event.id,
    student_id: event.studentId,
    student_name: event.studentName,
    type: event.type,
    payload: safePayload,
    idempotency_key: event.idempotencyKey ?? null,
    class_title: ccPayload?.classTitle ?? bcPayload?.title ?? "",
    class_date: ccPayload?.classDate ?? bcPayload?.body ?? "",
    start_time: ccPayload?.startTime ?? "",
    credit_reverted: ccPayload?.creditReverted ?? false,
    created_at: event.createdAt,
  };

  try {
    const { error } = await client
      .from(TABLE)
      .upsert(row, { onConflict: "id" });
    if (error)
      console.warn("[notification-store] save:", error.message);
  } catch (e) {
    console.warn(
      "[notification-store] save error:",
      e instanceof Error ? e.message : e
    );
  }
}

// ── Read ─────────────────────────────────────────────────────

export interface StoredNotification {
  id: string;
  studentId: string;
  studentName: string;
  type: CommEventType;
  payload: CommEventPayloadMap[CommEventType];
  idempotencyKey: string | null;
  createdAt: string;
}

export async function getNotificationsForStudent(
  studentId: string
): Promise<StoredNotification[]> {
  const client = getClient();
  if (!client) return [];

  const cutoff = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const { data, error } = await client
      .from(TABLE)
      .select("*")
      .eq("student_id", studentId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[notification-store] fetch:", error.message);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((r: any) => mapRow(r));
  } catch (e) {
    console.warn(
      "[notification-store] fetch error:",
      e instanceof Error ? e.message : e
    );
    return [];
  }
}

/**
 * Parse JSONB payload robustly.
 * PostgREST usually returns JSONB as a parsed object, but edge cases
 * (schema-cache lag, client version quirks) can produce a JSON string
 * or null instead. Handle all variants so downstream builders always
 * receive a real JS object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.length > 2) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* not valid JSON — fall through */
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): StoredNotification {
  const type = r.type as CommEventType;

  let payload: CommEventPayloadMap[CommEventType];
  const parsed = parsePayload(r.payload);

  if (parsed && Object.keys(parsed).length > 0) {
    payload = parsed as unknown as CommEventPayloadMap[CommEventType];
  } else if (type === "class_cancelled") {
    payload = {
      classTitle: r.class_title ?? "",
      classDate: r.class_date ?? "",
      startTime: r.start_time ?? "",
      creditReverted: !!r.credit_reverted,
    } as ClassCancelledPayload;
  } else if (type === "admin_broadcast") {
    // Fallback: title/body were stored in class_title/class_date columns
    // for resilience when JSONB payload is empty or missing.
    payload = {
      broadcastId: "",
      title: r.class_title ?? "",
      body: r.class_date ?? "",
    } as unknown as CommEventPayloadMap[CommEventType];
  } else {
    payload = {} as CommEventPayloadMap[CommEventType];
  }

  return {
    id: r.id,
    studentId: r.student_id,
    studentName: r.student_name,
    type,
    payload,
    idempotencyKey: r.idempotency_key ?? null,
    createdAt: r.created_at,
  };
}

// ── Idempotency check ────────────────────────────────────────

export async function hasNotificationWithKey(
  studentId: string,
  idempotencyKey: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    const { count, error } = await client
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("idempotency_key", idempotencyKey);

    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Update the payload of an existing notification identified by idempotency key.
 * Used when business-rule corrections must propagate to already-persisted
 * notifications (e.g. birthday benefit date range change).
 */
export async function updateNotificationPayloadByKey(
  studentId: string,
  idempotencyKey: string,
  newPayload: Record<string, unknown>
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from(TABLE)
      .update({ payload: newPayload })
      .eq("student_id", studentId)
      .eq("idempotency_key", idempotencyKey);

    if (error) {
      console.warn("[notification-store] update-payload:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      "[notification-store] update-payload error:",
      e instanceof Error ? e.message : e
    );
    return false;
  }
}

// ── Dismiss ──────────────────────────────────────────────────

export async function dismissNotification(
  noticeId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client
      .from(TABLE)
      .delete()
      .eq("id", noticeId);
    if (error)
      console.warn("[notification-store] dismiss:", error.message);
  } catch (e) {
    console.warn(
      "[notification-store] dismiss error:",
      e instanceof Error ? e.message : e
    );
  }
}

export async function dismissNotificationsForSubscription(
  studentId: string,
  subscriptionId: string,
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { data, error: fetchErr } = await client
      .from(TABLE)
      .select("id, payload")
      .eq("student_id", studentId);
    if (fetchErr || !data) return;
    const toDelete = data.filter((r: { id: string; payload: unknown }) => {
      const p = r.payload as Record<string, unknown> | null;
      return p?.subscriptionId === subscriptionId;
    });
    for (const row of toDelete) {
      await client.from(TABLE).delete().eq("id", row.id);
    }
  } catch (e) {
    console.warn("[notification-store] dismiss-by-sub:", e instanceof Error ? e.message : e);
  }
}

export async function dismissNotificationsByType(
  studentId: string,
  type: CommEventType
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client
      .from(TABLE)
      .delete()
      .eq("student_id", studentId)
      .eq("type", type);
    if (error)
      console.warn("[notification-store] dismiss-by-type:", error.message);
  } catch (e) {
    console.warn(
      "[notification-store] dismiss-by-type error:",
      e instanceof Error ? e.message : e
    );
  }
}

export async function dismissAllNotificationsForStudent(
  studentId: string
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    const { error } = await client
      .from(TABLE)
      .delete()
      .eq("student_id", studentId);
    if (error)
      console.warn("[notification-store] dismiss-all:", error.message);
  } catch (e) {
    console.warn(
      "[notification-store] dismiss-all error:",
      e instanceof Error ? e.message : e
    );
  }
}
