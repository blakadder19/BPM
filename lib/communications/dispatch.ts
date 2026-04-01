import "server-only";

/**
 * Central dispatch for communication events.
 *
 * Channels:
 *   1. In-app notification (Supabase student_notifications) — implemented now
 *   2. Email — future hook point (see sendToEmailChannel placeholder)
 *
 * Idempotency:
 *   Each event may carry an idempotencyKey. If a notification with that key
 *   already exists for the student, the duplicate is silently skipped.
 */

import type { CommEvent, CommEventType } from "./events";
import {
  saveGenericNotificationToDB,
  hasNotificationWithKey,
} from "./notification-store";
import { isRealUser } from "@/lib/utils/is-real-user";
import {
  addClassCancellationNotices,
} from "@/lib/services/class-cancellation-store";
import type { ClassCancelledPayload } from "./events";

/**
 * Dispatch one or more communication events through all active channels.
 * Safe to call from server actions — never throws.
 */
export async function dispatchCommEvents(
  events: CommEvent[]
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      const dispatched = await dispatchSingle(event);
      if (dispatched) {
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (e) {
      console.warn(
        `[comm-dispatch] Failed to dispatch ${event.type} for ${event.studentId}:`,
        e instanceof Error ? e.message : e
      );
      skipped += 1;
    }
  }

  return { sent, skipped };
}

async function dispatchSingle(event: CommEvent): Promise<boolean> {
  if (event.idempotencyKey) {
    const exists = await hasNotificationWithKey(
      event.studentId,
      event.idempotencyKey
    );
    if (exists) return false;
  }

  // Channel 1: In-app notification (Supabase)
  await sendToInAppChannel(event);

  // Channel 2: In-memory store for dev/mock students (class_cancelled only)
  if (!isRealUser(event.studentId) && event.type === "class_cancelled") {
    const p = event.payload as ClassCancelledPayload;
    addClassCancellationNotices([
      {
        studentId: event.studentId,
        studentName: event.studentName,
        classTitle: p.classTitle,
        classDate: p.classDate,
        startTime: p.startTime,
        creditReverted: p.creditReverted,
      },
    ]);
  }

  // Channel 3: Email — future integration point
  // await sendToEmailChannel(event);

  return true;
}

async function sendToInAppChannel(event: CommEvent): Promise<void> {
  if (!isRealUser(event.studentId)) return;
  await saveGenericNotificationToDB(event);
}

/**
 * FUTURE: Email channel hook.
 * When email sending is enabled, this function will:
 *   1. Build subject/body via buildMessage()
 *   2. Resolve the student's email address
 *   3. Send via the configured email provider (Supabase Edge Function, Resend, etc.)
 *
 * This is intentionally a no-op placeholder for now.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sendToEmailChannel(_event: CommEvent): Promise<void> {
  // No-op — ready for future implementation
}
