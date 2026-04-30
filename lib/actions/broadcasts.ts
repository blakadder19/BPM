"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/staff-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAcademyId } from "@/lib/supabase/academy";
import { resolveAudience, type AudienceType, type AudienceParams } from "@/lib/services/broadcast-audience";
import { adminBroadcastEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import { getAppUrl } from "@/lib/utils/app-url";
import {
  resolveCtaAbsoluteUrl,
  resolveCtaPath,
  type CtaDestinationType,
  type CtaDestination,
} from "@/lib/domain/cta-types";
import type { CommEvent } from "@/lib/communications/events";

// ── Types ────────────────────────────────────────────────────

export type BroadcastChannel = "in_app" | "email";

export interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  channels: BroadcastChannel[];
  audienceType: AudienceType;
  audienceParams: AudienceParams;
  status: "draft" | "sent";
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  recipientCount: number;
  emailSentCount: number;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  ctaDestinationType: CtaDestinationType | null;
  ctaDestinationId: string | null;
  category: string | null;
}

// ── Helpers ──────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): BroadcastRow {
  return {
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    channels: (r.channels as BroadcastChannel[]) ?? ["in_app"],
    audienceType: (r.audience_type as AudienceType) ?? "all_students",
    audienceParams: (r.audience_params as AudienceParams) ?? {},
    status: (r.status as "draft" | "sent") ?? "draft",
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    sentAt: (r.sent_at as string) ?? null,
    recipientCount: (r.recipient_count as number) ?? 0,
    emailSentCount: (r.email_sent_count as number) ?? 0,
    imageUrl: (r.image_url as string) ?? null,
    ctaLabel: (r.cta_label as string) ?? null,
    ctaUrl: (r.cta_url as string) ?? null,
    ctaDestinationType: (r.cta_destination_type as CtaDestinationType) ?? null,
    ctaDestinationId: (r.cta_destination_id as string) ?? null,
    category: (r.category as string) ?? null,
  };
}

/**
 * Resolve CTA URLs from a broadcast's structured destination metadata.
 * Falls back to the legacy ctaUrl for older broadcasts.
 */
function resolveCtaUrls(broadcast: {
  ctaDestinationType: CtaDestinationType | null;
  ctaDestinationId: string | null;
  ctaUrl: string | null;
}): { inAppUrl: string | null; emailUrl: string | null } {
  if (broadcast.ctaDestinationType) {
    const dest: CtaDestination = {
      type: broadcast.ctaDestinationType,
      targetId: broadcast.ctaDestinationId,
      externalUrl: broadcast.ctaUrl,
    };
    return {
      inAppUrl: resolveCtaPath(dest),
      emailUrl: resolveCtaAbsoluteUrl(dest, getAppUrl()),
    };
  }
  // Legacy: raw URL stored directly
  return {
    inAppUrl: broadcast.ctaUrl,
    emailUrl: broadcast.ctaUrl,
  };
}

// ── Preview audience count ───────────────────────────────────

export async function previewAudienceAction(
  audienceType: AudienceType,
  audienceParams: AudienceParams = {}
): Promise<{ count: number; sampleNames: string[] }> {
  await requireSuperAdmin();
  const result = await resolveAudience(audienceType, audienceParams);
  return {
    count: result.students.length,
    sampleNames: result.students.slice(0, 5).map((s) => s.name),
  };
}

// ── Create (draft) ───────────────────────────────────────────

export async function createBroadcastAction(input: {
  title: string;
  body: string;
  channels: BroadcastChannel[];
  audienceType: AudienceType;
  audienceParams?: AudienceParams;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctaDestinationType?: CtaDestinationType;
  ctaDestinationId?: string;
  category?: string;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const access = await requireSuperAdmin();
  const user = access.user;
  const supabase = createAdminClient();
  const academyId = await getAcademyId();

  if (!input.title.trim() || !input.body.trim()) {
    return { success: false, error: "Title and body are required." };
  }
  if (input.channels.length === 0) {
    return { success: false, error: "At least one delivery channel is required." };
  }
  const hasCtaDest = !!input.ctaDestinationType;
  const hasCtaLabel = !!input.ctaLabel?.trim();
  if (hasCtaDest && !hasCtaLabel) {
    return { success: false, error: "CTA button needs a label." };
  }

  // For structured destinations, resolve and store the URL too (for legacy consumers)
  let resolvedCtaUrl = input.ctaUrl?.trim() || null;
  if (input.ctaDestinationType && input.ctaDestinationType !== "external_url") {
    const dest: CtaDestination = {
      type: input.ctaDestinationType,
      targetId: input.ctaDestinationId,
    };
    resolvedCtaUrl = resolveCtaAbsoluteUrl(dest, getAppUrl());
  }

  const { data, error } = await supabase
    .from("admin_broadcasts")
    .insert({
      academy_id: academyId,
      title: input.title.trim(),
      body: input.body.trim(),
      channels: input.channels,
      audience_type: input.audienceType,
      audience_params: input.audienceParams ?? {},
      status: "draft",
      created_by: user.fullName,
      image_url: input.imageUrl?.trim() || null,
      cta_label: input.ctaLabel?.trim() || null,
      cta_url: resolvedCtaUrl,
      cta_destination_type: input.ctaDestinationType || null,
      cta_destination_id: input.ctaDestinationId?.trim() || null,
      category: input.category?.trim() || null,
    } as never)
    .select("id")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/broadcasts");
  return { success: true, id: (data as { id: string }).id };
}

// ── Send (publish) ───────────────────────────────────────────

export async function sendBroadcastAction(
  broadcastId: string
): Promise<{ success: boolean; error?: string; recipientCount?: number; emailSentCount?: number }> {
  await requireSuperAdmin();
  const supabase = createAdminClient();

  const { data: row, error: fetchErr } = await supabase
    .from("admin_broadcasts")
    .select("*")
    .eq("id", broadcastId)
    .single();

  if (fetchErr || !row) {
    return { success: false, error: "Broadcast not found." };
  }

  const broadcast = row as Record<string, unknown>;
  if (broadcast.status === "sent") {
    return { success: false, error: "This broadcast has already been sent." };
  }

  const audienceType = broadcast.audience_type as AudienceType;
  const audienceParams = (broadcast.audience_params as AudienceParams) ?? {};
  const channels = (broadcast.channels as BroadcastChannel[]) ?? ["in_app"];
  const title = broadcast.title as string;
  const body = broadcast.body as string;
  const imageUrl = (broadcast.image_url as string) || null;
  const ctaLabel = (broadcast.cta_label as string) || null;
  const category = (broadcast.category as string) || null;

  const ctaUrls = resolveCtaUrls({
    ctaDestinationType: (broadcast.cta_destination_type as CtaDestinationType) ?? null,
    ctaDestinationId: (broadcast.cta_destination_id as string) ?? null,
    ctaUrl: (broadcast.cta_url as string) ?? null,
  });

  const audience = await resolveAudience(audienceType, audienceParams);
  if (audience.students.length === 0) {
    return { success: false, error: "No matching students found for this audience." };
  }

  const sendEmail = channels.includes("email");
  const sendInApp = channels.includes("in_app");

  const events: CommEvent[] = audience.students.map((s) =>
    adminBroadcastEvent({
      studentId: s.id,
      studentName: s.name,
      broadcastId,
      title,
      body,
      imageUrl,
      ctaLabel,
      ctaUrl: ctaUrls.inAppUrl,
      ctaEmailUrl: ctaUrls.emailUrl,
      category,
    })
  );

  let inAppSent = 0;
  let emailSent = 0;

  if (sendInApp && !sendEmail) {
    // In-app only — dispatch through the standard pipeline but without email.
    // We dispatch individually to control channel selection.
    const { saveGenericNotificationToDB } = await import(
      "@/lib/communications/notification-store"
    );
    const { isRealUser } = await import("@/lib/utils/is-real-user");

    for (const event of events) {
      try {
        const { hasNotificationWithKey } = await import(
          "@/lib/communications/notification-store"
        );
        if (event.idempotencyKey) {
          const exists = await hasNotificationWithKey(
            event.studentId,
            event.idempotencyKey
          );
          if (exists) continue;
        }
        if (isRealUser(event.studentId)) {
          await saveGenericNotificationToDB(event);
          inAppSent++;
        }
      } catch {
        // Skip this student on error
      }
    }
  } else if (sendEmail && !sendInApp) {
    // Email only
    const { isEmailEnabled, sendEmail: sendEmailFn } = await import(
      "@/lib/communications/email-provider"
    );
    const { buildEmailContent } = await import(
      "@/lib/communications/email-templates"
    );
    const { resolveStudentEmail } = await import(
      "@/lib/communications/email-resolver"
    );

    if (isEmailEnabled()) {
      for (const event of events) {
        try {
          const email = await resolveStudentEmail(event.studentId);
          if (!email) continue;
          const { subject, html } = buildEmailContent(
            "admin_broadcast",
            event.studentName,
            event.payload as never
          );
          const ok = await sendEmailFn({ to: email, subject, html });
          if (ok) emailSent++;
        } catch {
          // Skip
        }
      }
    }
  } else {
    // Both channels — use the standard dispatcher
    const result = await dispatchCommEvents(events);
    inAppSent = result.sent;
    emailSent = result.sent;
  }

  const recipientCount = Math.max(inAppSent, emailSent, audience.students.length);

  await supabase
    .from("admin_broadcasts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_count: recipientCount,
      email_sent_count: emailSent,
    } as never)
    .eq("id", broadcastId);

  revalidatePath("/broadcasts");
  return { success: true, recipientCount, emailSentCount: emailSent };
}

// ── List broadcasts ──────────────────────────────────────────

export async function listBroadcastsAction(): Promise<BroadcastRow[]> {
  await requireSuperAdmin();
  const supabase = createAdminClient();
  const academyId = await getAcademyId();

  const { data, error } = await supabase
    .from("admin_broadcasts")
    .select("*")
    .eq("academy_id", academyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.warn("[broadcasts] list:", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
}

// ── Delete broadcast ─────────────────────────────────────────

export async function deleteBroadcastAction(
  broadcastId: string
): Promise<{ success: boolean; error?: string }> {
  await requireSuperAdmin();
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("admin_broadcasts")
    .select("status")
    .eq("id", broadcastId)
    .single();

  if (!row) return { success: false, error: "Not found." };

  const wasSent = (row as { status: string }).status === "sent";

  // If the broadcast was sent, also clean up delivered student notifications
  if (wasSent) {
    const idempotencyPrefix = `admin_broadcast:`;
    const idempotencySuffix = `:${broadcastId}`;
    try {
      const { data: notifs } = await supabase
        .from("student_notifications")
        .select("id, idempotency_key")
        .eq("type", "admin_broadcast")
        .like("idempotency_key", `${idempotencyPrefix}%${idempotencySuffix}`);
      if (notifs && notifs.length > 0) {
        const ids = (notifs as { id: string }[]).map((n) => n.id);
        await supabase
          .from("student_notifications")
          .delete()
          .in("id", ids);
      }
    } catch (e) {
      console.warn(
        "[broadcasts] cleanup notifications:",
        e instanceof Error ? e.message : e
      );
    }
  }

  const { error } = await supabase
    .from("admin_broadcasts")
    .delete()
    .eq("id", broadcastId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/broadcasts");
  return { success: true };
}
