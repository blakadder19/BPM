"use server";

import { requireRole } from "@/lib/auth";
import { getSpecialEventRepo, getStudentRepo } from "@/lib/repositories";
import { eventAnnouncementEvent } from "@/lib/communications/builders";
import { dispatchCommEvents } from "@/lib/communications/dispatch";
import { isEmailEnabled, sendEmail } from "@/lib/communications/email-provider";
import { buildEmailContent } from "@/lib/communications/email-templates";
import type { EventAnnouncementPayload } from "@/lib/communications/events";

function formatEventDates(startDate: string, endDate: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-IE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`;
}

export interface AnnouncementResult {
  success: boolean;
  error?: string;
  sentCount?: number;
  inAppCount?: number;
  emailCount?: number;
  warnings?: string[];
}

/**
 * Admin sends an event announcement to internal students and/or external email recipients.
 */
export async function sendEventAnnouncementAction(input: {
  eventId: string;
  recipientMode: "all_students" | "selected_students" | "external_only";
  selectedStudentIds?: string[];
  externalEmails?: string[];
  sendInApp: boolean;
  sendEmail: boolean;
}): Promise<AnnouncementResult> {
  await requireRole(["admin"]);

  const repo = getSpecialEventRepo();
  const event = await repo.getEventById(input.eventId);
  if (!event) return { success: false, error: "Event not found" };

  const dates = formatEventDates(event.startDate, event.endDate);
  const shortDescription =
    event.description.length > 200
      ? event.description.slice(0, 200) + "…"
      : event.description;

  const emailEnabled = isEmailEnabled();
  const warnings: string[] = [];
  let inAppCount = 0;
  let emailCount = 0;

  if (input.sendEmail && !emailEnabled) {
    warnings.push("Email sending is not configured (BREVO_API_KEY missing). Email notifications were skipped.");
  }

  if (input.recipientMode !== "external_only") {
    const studentRepo = getStudentRepo();
    const allStudents = await studentRepo.getAll();

    const targetStudents =
      input.recipientMode === "selected_students" && input.selectedStudentIds?.length
        ? allStudents.filter((s) => input.selectedStudentIds!.includes(s.id))
        : allStudents;

    if (input.sendInApp) {
      const commEvents = targetStudents.map((s) =>
        eventAnnouncementEvent({
          studentId: s.id,
          studentName: s.fullName,
          eventTitle: event.title,
          eventId: event.id,
          shortDescription,
          dates,
          location: event.location,
        }),
      );

      const { sent } = await dispatchCommEvents(commEvents);
      inAppCount += sent;
    }

    if (input.sendEmail && emailEnabled) {
      for (const s of targetStudents) {
        if (!s.email) continue;
        const payload: EventAnnouncementPayload = {
          eventTitle: event.title,
          eventId: event.id,
          shortDescription,
          dates,
          location: event.location,
        };
        const { subject, html } = buildEmailContent("event_announcement", s.fullName, payload);
        const ok = await sendEmail({ to: s.email, subject, html });
        if (ok) emailCount++;
      }
    }
  }

  const externalEmails = (input.externalEmails ?? []).filter((e) => e.includes("@"));
  if (externalEmails.length > 0 && input.sendEmail && emailEnabled) {
    const payload: EventAnnouncementPayload = {
      eventTitle: event.title,
      eventId: event.id,
      shortDescription,
      dates,
      location: event.location,
    };
    for (const email of externalEmails) {
      const { subject, html } = buildEmailContent("event_announcement", "there", payload);
      const ok = await sendEmail({ to: email, subject, html });
      if (ok) emailCount++;
    }
  } else if (externalEmails.length > 0 && input.sendEmail && !emailEnabled) {
    warnings.push(`${externalEmails.length} external email(s) could not be sent — email is not configured.`);
  }

  const sentCount = inAppCount + emailCount;

  return { success: true, sentCount, inAppCount, emailCount, warnings };
}
