"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  createSession,
  updateSession,
  deleteSession,
  createEventProduct,
  updateEventProduct,
  deleteEventProduct,
} from "@/lib/services/special-event-service";
import { uploadEventCover, removeEventCover } from "@/lib/services/event-image-storage";
import { sessionRealDateTimes, formatEventDateRange } from "@/lib/utils";
import type {
  EventStatus,
  EventSessionType,
  EventProductType,
  EventInclusionRule,
} from "@/types/domain";

const VALID_STATUSES = new Set<string>(["draft", "published"]);
const VALID_SESSION_TYPES = new Set<string>(["workshop", "social", "intensive", "masterclass", "other"]);
const VALID_PRODUCT_TYPES = new Set<string>(["full_pass", "combo_pass", "single_session", "social_ticket", "other"]);
const VALID_INCLUSION_RULES = new Set<string>(["all_sessions", "selected_sessions", "all_workshops", "socials_only"]);

function validateSessionWithinEvent(
  date: string, startTime: string, endTime: string,
  eventStartDate: string, eventEndDate: string,
): string | null {
  const { start: sessionStart, end: sessionEnd } = sessionRealDateTimes(date, startTime, endTime);
  const evtStart = new Date(eventStartDate).getTime();
  const evtEnd = new Date(eventEndDate).getTime();
  const sessStart = new Date(sessionStart).getTime();
  const sessEnd = new Date(sessionEnd).getTime();

  if (sessStart < evtStart) {
    return `This session starts before the event begins (${formatEventDateRange(eventStartDate, eventEndDate)})`;
  }
  if (sessEnd > evtEnd) {
    return endTime <= startTime
      ? `This overnight session ends after the event finishes (${formatEventDateRange(eventStartDate, eventEndDate)})`
      : `This session ends after the event finishes (${formatEventDateRange(eventStartDate, eventEndDate)})`;
  }
  return null;
}

function eurosToCents(raw: string | null): number {
  if (!raw || raw.trim() === "") return 0;
  const euros = parseFloat(raw);
  if (isNaN(euros)) return NaN;
  return Math.round(euros * 100);
}

function parseOptionalInt(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

function revalidateEvents(eventId?: string) {
  revalidatePath("/events");
  if (eventId) revalidatePath(`/events/${eventId}`);
  revalidatePath("/dashboard");
}

/**
 * Resolve cover image from FormData:
 * 1. If "removeCoverImage" is set, return null (image removal)
 * 2. If a File is uploaded, upload it to Storage and return the URL
 * 3. Otherwise fall back to the text URL input
 */
async function resolveCoverImage(
  formData: FormData,
  eventId: string,
  existingUrl: string | null,
): Promise<{ url: string | null; error?: string }> {
  if (formData.get("removeCoverImage") === "true") {
    await removeEventCover(eventId).catch(() => {});
    return { url: null };
  }

  const file = formData.get("coverImageFile");
  if (file instanceof File && file.size > 0) {
    const result = await uploadEventCover(eventId, file);
    if ("error" in result) return { url: existingUrl, error: result.error };
    return { url: result.url };
  }

  const urlInput = (formData.get("coverImageUrl") as string)?.trim() || null;
  return { url: urlInput ?? existingUrl };
}

// ── Event CRUD ───────────────────────────────────────────────

export async function createEventAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const title = (formData.get("title") as string)?.trim();
  const subtitle = (formData.get("subtitle") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || "";
  const urlInput = (formData.get("coverImageUrl") as string)?.trim() || null;
  const location = (formData.get("location") as string)?.trim() || "";
  const startDate = (formData.get("startDate") as string)?.trim();
  const endDate = (formData.get("endDate") as string)?.trim();
  const status = (formData.get("status") as string) || "draft";
  const isVisible = formData.get("isVisible") === "on" || formData.get("isVisible") === "true";
  const isFeatured = formData.get("isFeatured") === "on" || formData.get("isFeatured") === "true";
  const featuredOnDashboard = formData.get("featuredOnDashboard") === "on" || formData.get("featuredOnDashboard") === "true";
  const isPublic = formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  const salesOpen = formData.get("salesOpen") === "on" || formData.get("salesOpen") === "true";
  const allowReceptionPayment = formData.get("allowReceptionPayment") === "on" || formData.get("allowReceptionPayment") === "true";
  const rawCapacity = (formData.get("overallCapacity") as string)?.trim();
  const overallCapacity = rawCapacity ? parseInt(rawCapacity, 10) : null;

  if (!title) return { success: false, error: "Title is required" };
  if (!startDate || !endDate) return { success: false, error: "Start and end dates are required" };
  if (new Date(startDate).getTime() >= new Date(endDate).getTime()) return { success: false, error: "End must be after start" };
  if (!VALID_STATUSES.has(status)) return { success: false, error: "Invalid status" };
  if (overallCapacity !== null && (isNaN(overallCapacity) || overallCapacity < 0)) return { success: false, error: "Overall capacity must be a positive number" };

  const result = await createEvent({
    title, subtitle, description, coverImageUrl: urlInput, location,
    startDate, endDate, status: status as EventStatus,
    isVisible, isFeatured, featuredOnDashboard, isPublic, salesOpen, overallCapacity, allowReceptionPayment,
  });

  if (result.success && result.id) {
    const file = formData.get("coverImageFile");
    if (file instanceof File && file.size > 0) {
      const upload = await uploadEventCover(result.id, file);
      if ("url" in upload) {
        await updateEvent(result.id, { coverImageUrl: upload.url });
      } else {
        revalidateEvents(result.id);
        return { success: true, error: `Event created, but image upload failed: ${upload.error}` };
      }
    }
  }

  if (result.success) revalidateEvents(result.id);
  return result;
}

export async function updateEventAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = formData.get("id") as string;
  if (!id) return { success: false, error: "Missing event ID" };

  const title = (formData.get("title") as string)?.trim();
  const subtitle = (formData.get("subtitle") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || "";
  const location = (formData.get("location") as string)?.trim() || "";
  const startDate = (formData.get("startDate") as string)?.trim();
  const endDate = (formData.get("endDate") as string)?.trim();
  const status = (formData.get("status") as string) || "draft";
  const isVisible = formData.get("isVisible") === "on" || formData.get("isVisible") === "true";
  const isFeatured = formData.get("isFeatured") === "on" || formData.get("isFeatured") === "true";
  const featuredOnDashboard = formData.get("featuredOnDashboard") === "on" || formData.get("featuredOnDashboard") === "true";
  const isPublic = formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  const salesOpen = formData.get("salesOpen") === "on" || formData.get("salesOpen") === "true";
  const allowReceptionPayment = formData.get("allowReceptionPayment") === "on" || formData.get("allowReceptionPayment") === "true";
  const rawCapacity = (formData.get("overallCapacity") as string)?.trim();
  const overallCapacity = rawCapacity ? parseInt(rawCapacity, 10) : null;

  if (!title) return { success: false, error: "Title is required" };
  if (!startDate || !endDate) return { success: false, error: "Start and end dates are required" };
  if (new Date(startDate).getTime() >= new Date(endDate).getTime()) return { success: false, error: "End must be after start" };
  if (!VALID_STATUSES.has(status)) return { success: false, error: "Invalid status" };
  if (overallCapacity !== null && (isNaN(overallCapacity) || overallCapacity < 0)) return { success: false, error: "Overall capacity must be a positive number" };

  const existing = await getEvent(id);
  const { url: coverImageUrl, error: imgError } = await resolveCoverImage(formData, id, existing?.coverImageUrl ?? null);
  if (imgError) return { success: false, error: imgError };

  const result = await updateEvent(id, {
    title, subtitle, description, coverImageUrl, location,
    startDate, endDate, status: status as EventStatus,
    isVisible, isFeatured, featuredOnDashboard, isPublic, salesOpen, overallCapacity, allowReceptionPayment,
  });
  if (result.success) revalidateEvents(id);
  return result;
}

export async function deleteEventAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing event ID" };
  const result = await deleteEvent(id);
  if (result.success) revalidateEvents();
  return result;
}

export async function removeEventCoverAction(
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!eventId) return { success: false, error: "Missing event ID" };
  await removeEventCover(eventId).catch(() => {});
  const result = await updateEvent(eventId, { coverImageUrl: null });
  if (result.success) revalidateEvents(eventId);
  return result;
}

// ── Session CRUD ─────────────────────────────────────────────

export async function createSessionAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const eventId = formData.get("eventId") as string;
  const title = (formData.get("title") as string)?.trim();
  const sessionType = formData.get("sessionType") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const teacherName = (formData.get("teacherName") as string)?.trim() || null;
  const room = (formData.get("room") as string)?.trim() || null;
  const capacity = parseOptionalInt(formData.get("capacity") as string);
  const description = (formData.get("description") as string)?.trim() || null;
  const sortOrder = parseInt(formData.get("sortOrder") as string) || 0;

  if (!eventId) return { success: false, error: "Missing event ID" };
  if (!title) return { success: false, error: "Title is required" };
  if (!VALID_SESSION_TYPES.has(sessionType)) return { success: false, error: "Invalid session type" };
  if (!date || !startTime || !endTime) return { success: false, error: "Date and times are required" };

  const parentEvent = await getEvent(eventId);
  if (!parentEvent) return { success: false, error: "Parent event not found" };
  const sessionErr = validateSessionWithinEvent(date, startTime, endTime, parentEvent.startDate, parentEvent.endDate);
  if (sessionErr) return { success: false, error: sessionErr };

  const result = await createSession({
    eventId, title, sessionType: sessionType as EventSessionType,
    date, startTime, endTime, teacherName, room, capacity, description, sortOrder,
  });
  if (result.success) revalidateEvents(eventId);
  return result;
}

export async function updateSessionAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = formData.get("id") as string;
  const eventId = formData.get("eventId") as string;
  if (!id) return { success: false, error: "Missing session ID" };

  const title = (formData.get("title") as string)?.trim();
  const sessionType = formData.get("sessionType") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const teacherName = (formData.get("teacherName") as string)?.trim() || null;
  const room = (formData.get("room") as string)?.trim() || null;
  const capacity = parseOptionalInt(formData.get("capacity") as string);
  const description = (formData.get("description") as string)?.trim() || null;
  const sortOrder = parseInt(formData.get("sortOrder") as string) || 0;

  if (!title) return { success: false, error: "Title is required" };
  if (!VALID_SESSION_TYPES.has(sessionType)) return { success: false, error: "Invalid session type" };
  if (date && startTime && endTime) {
    const parentEvent = await getEvent(eventId);
    if (parentEvent) {
      const sessionErr = validateSessionWithinEvent(date, startTime, endTime, parentEvent.startDate, parentEvent.endDate);
      if (sessionErr) return { success: false, error: sessionErr };
    }
  }

  const result = await updateSession(id, {
    title, sessionType: sessionType as EventSessionType,
    date, startTime, endTime, teacherName, room, capacity, description, sortOrder,
  });
  if (result.success) revalidateEvents(eventId);
  return result;
}

export async function deleteSessionAction(
  id: string,
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing session ID" };
  const result = await deleteSession(id);
  if (result.success) revalidateEvents(eventId);
  return result;
}

// ── Event Product CRUD ───────────────────────────────────────

export async function createEventProductAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const eventId = formData.get("eventId") as string;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const priceCents = eurosToCents(formData.get("priceEuros") as string);
  const productType = formData.get("productType") as string;
  const isVisible = formData.get("isVisible") === "on" || formData.get("isVisible") === "true";
  const salesOpen = formData.get("salesOpen") === "on" || formData.get("salesOpen") === "true";
  const inclusionRule = formData.get("inclusionRule") as string;
  const includedSessionIdsRaw = formData.getAll("includedSessionIds") as string[];
  const includedSessionIds = includedSessionIdsRaw.filter(Boolean).length > 0 ? includedSessionIdsRaw.filter(Boolean) : null;
  const sortOrder = parseInt(formData.get("sortOrder") as string) || 0;

  if (!eventId) return { success: false, error: "Missing event ID" };
  if (!name) return { success: false, error: "Name is required" };
  if (isNaN(priceCents) || priceCents < 0) return { success: false, error: "Invalid price" };
  if (!VALID_PRODUCT_TYPES.has(productType)) return { success: false, error: "Invalid product type" };
  if (!VALID_INCLUSION_RULES.has(inclusionRule)) return { success: false, error: "Invalid inclusion rule" };

  const result = await createEventProduct({
    eventId, name, description, priceCents,
    productType: productType as EventProductType,
    isVisible, salesOpen,
    inclusionRule: inclusionRule as EventInclusionRule,
    includedSessionIds, sortOrder,
  });
  if (result.success) revalidateEvents(eventId);
  return result;
}

export async function updateEventProductAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  const id = formData.get("id") as string;
  const eventId = formData.get("eventId") as string;
  if (!id) return { success: false, error: "Missing product ID" };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const priceCents = eurosToCents(formData.get("priceEuros") as string);
  const productType = formData.get("productType") as string;
  const isVisible = formData.get("isVisible") === "on" || formData.get("isVisible") === "true";
  const salesOpen = formData.get("salesOpen") === "on" || formData.get("salesOpen") === "true";
  const inclusionRule = formData.get("inclusionRule") as string;
  const includedSessionIdsRaw = formData.getAll("includedSessionIds") as string[];
  const includedSessionIds = includedSessionIdsRaw.filter(Boolean).length > 0 ? includedSessionIdsRaw.filter(Boolean) : null;
  const sortOrder = parseInt(formData.get("sortOrder") as string) || 0;

  if (!name) return { success: false, error: "Name is required" };
  if (isNaN(priceCents) || priceCents < 0) return { success: false, error: "Invalid price" };
  if (!VALID_PRODUCT_TYPES.has(productType)) return { success: false, error: "Invalid product type" };
  if (!VALID_INCLUSION_RULES.has(inclusionRule)) return { success: false, error: "Invalid inclusion rule" };

  const result = await updateEventProduct(id, {
    name, description, priceCents,
    productType: productType as EventProductType,
    isVisible, salesOpen,
    inclusionRule: inclusionRule as EventInclusionRule,
    includedSessionIds, sortOrder,
  });
  if (result.success) revalidateEvents(eventId);
  return result;
}

export async function deleteEventProductAction(
  id: string,
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireRole(["admin"]);
  if (!id) return { success: false, error: "Missing product ID" };
  const result = await deleteEventProduct(id);
  if (result.success) revalidateEvents(eventId);
  return result;
}
