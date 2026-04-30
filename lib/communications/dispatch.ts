import "server-only";

/**
 * Central dispatch for communication events.
 *
 * Channels:
 *   1. In-app notification (Supabase student_notifications)
 *   2. Email (Brevo transactional API) — sends when BREVO_API_KEY is configured
 *   3. In-memory mock store (dev-only, class_cancelled)
 *
 * Idempotency:
 *   Each event may carry an idempotencyKey. If a notification with that key
 *   already exists for the student, the duplicate is silently skipped.
 *   This covers all channels — if the event was already processed,
 *   neither in-app nor email is sent again.
 */

import type { CommEvent, CommEventType } from "./events";
import {
  saveGenericNotificationToDB,
  hasNotificationWithKey,
  updateNotificationPayloadByKey,
} from "./notification-store";
import { isRealUser } from "@/lib/utils/is-real-user";
import {
  addClassCancellationNotices,
} from "@/lib/services/class-cancellation-store";
import type { ClassCancelledPayload } from "./events";
import { isEmailEnabled, sendEmail } from "./email-provider";
import { buildEmailContent } from "./email-templates";
import { resolveStudentEmail } from "./email-resolver";

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

/**
 * Event types whose stored payload should be refreshed when the event
 * is dispatched again with updated data. Prevents stale persisted
 * notifications after business-rule corrections.
 */
const REFRESHABLE_EVENT_TYPES = new Set<CommEventType>([
  "birthday_benefit_available",
]);

async function dispatchSingle(event: CommEvent): Promise<boolean> {
  if (event.idempotencyKey) {
    const exists = await hasNotificationWithKey(
      event.studentId,
      event.idempotencyKey
    );
    if (exists) {
      if (REFRESHABLE_EVENT_TYPES.has(event.type) && isRealUser(event.studentId)) {
        await updateNotificationPayloadByKey(
          event.studentId,
          event.idempotencyKey,
          event.payload as unknown as Record<string, unknown>
        );
      }
      return false;
    }
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

  // Channel 3: Email (Brevo)
  await sendToEmailChannel(event);

  return true;
}

async function sendToInAppChannel(event: CommEvent): Promise<void> {
  if (!isRealUser(event.studentId)) return;
  await saveGenericNotificationToDB(event);
}

/**
 * Email channel: resolves student email, builds HTML content, sends via Brevo.
 * No-ops gracefully if email is not configured or the address cannot be resolved.
 *
 * Logging policy (improved for QA round 3):
 *   - Always log the gating decision so admins can see WHY an email
 *     didn't arrive (BREVO_API_KEY missing / email unresolved / Brevo
 *     rejected) without having to read the email-provider source.
 *   - Includes event type and event id in every line so logs from
 *     `purchase_confirmed` events can be correlated end-to-end.
 */
async function sendToEmailChannel(event: CommEvent): Promise<void> {
  if (!isEmailEnabled()) {
    console.info(
      `[email] BREVO_API_KEY not configured — skipping ${event.type} for student ${event.studentId} (event ${event.id}). Set BREVO_API_KEY in the server environment to enable transactional sends.`,
    );
    return;
  }

  const email = await resolveStudentEmail(event.studentId);
  if (!email) {
    console.info(
      `[email] No email address for student ${event.studentId} — skipping ${event.type} (event ${event.id}).`,
    );
    return;
  }

  const { subject, html } = buildEmailContent(
    event.type,
    event.studentName,
    event.payload as Parameters<typeof buildEmailContent>[2]
  );

  const ok = await sendEmail({ to: email, subject, html });
  if (ok) {
    console.info(
      `[email] Sent ${event.type} to ${email} (event ${event.id})`,
    );
  } else {
    // sendEmail() already logged the Brevo response body; surface a
    // clear correlation line at the dispatch layer so /finance and
    // QA reports can find why a specific event didn't deliver.
    console.warn(
      `[email] Brevo rejected ${event.type} for student ${event.studentId} (event ${event.id}). Common causes: sender domain not verified in Brevo, recipient on Brevo blocklist, plan limit reached.`,
    );
  }
}
