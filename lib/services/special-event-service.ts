import { getSpecialEventRepo } from "@/lib/repositories";
import type {
  CreateEventData,
  EventPatch,
  CreateSessionData,
  SessionPatch,
  CreateEventProductData,
  EventProductPatch,
  CreatePurchaseData,
} from "@/lib/repositories/interfaces/special-event-repository";
import type { EventPaymentStatus } from "@/types/domain";

type Result<T = undefined> = { success: true; data?: T } | { success: false; error: string };

// ── Events ───────────────────────────────────────────────────

export async function getEvents() { return getSpecialEventRepo().getAllEvents(); }
export async function getEvent(id: string) { return getSpecialEventRepo().getEventById(id); }

export async function createEvent(data: CreateEventData): Promise<Result & { id?: string }> {
  try {
    const created = await getSpecialEventRepo().createEvent(data);
    return { success: true, id: created.id };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function updateEvent(id: string, patch: EventPatch): Promise<Result> {
  try {
    const result = await getSpecialEventRepo().updateEvent(id, patch);
    if (!result) return { success: false, error: "Event not found" };
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function deleteEvent(id: string): Promise<Result> {
  try {
    await getSpecialEventRepo().deleteEvent(id);
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

// ── Sessions ─────────────────────────────────────────────────

export async function getSessionsByEvent(eventId: string) { return getSpecialEventRepo().getSessionsByEvent(eventId); }

export async function createSession(data: CreateSessionData): Promise<Result> {
  try {
    await getSpecialEventRepo().createSession(data);
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function updateSession(id: string, patch: SessionPatch): Promise<Result> {
  try {
    const result = await getSpecialEventRepo().updateSession(id, patch);
    if (!result) return { success: false, error: "Session not found" };
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function deleteSession(id: string): Promise<Result> {
  try {
    await getSpecialEventRepo().deleteSession(id);
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

// ── Event Products ───────────────────────────────────────────

export async function getProductsByEvent(eventId: string) { return getSpecialEventRepo().getProductsByEvent(eventId); }

export async function createEventProduct(data: CreateEventProductData): Promise<Result> {
  try {
    await getSpecialEventRepo().createEventProduct(data);
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function updateEventProduct(id: string, patch: EventProductPatch): Promise<Result> {
  try {
    const result = await getSpecialEventRepo().updateEventProduct(id, patch);
    if (!result) return { success: false, error: "Event product not found" };
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function deleteEventProduct(id: string): Promise<Result> {
  try {
    await getSpecialEventRepo().deleteEventProduct(id);
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

// ── Purchases ────────────────────────────────────────────────

export async function getPurchasesByEvent(eventId: string) { return getSpecialEventRepo().getPurchasesByEvent(eventId); }
export async function getPurchasesByStudent(studentId: string) { return getSpecialEventRepo().getPurchasesByStudent(studentId); }

export async function createPurchase(data: CreatePurchaseData): Promise<Result<string>> {
  try {
    const purchase = await getSpecialEventRepo().createPurchase(data);
    return { success: true, data: purchase.id };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}

export async function updatePurchasePayment(
  id: string,
  patch: { paymentStatus: EventPaymentStatus; paymentReference?: string | null; receptionMethod?: string | null; paidAt?: string | null; qrToken?: string | null },
): Promise<Result> {
  try {
    const result = await getSpecialEventRepo().updatePurchasePayment(id, patch);
    if (!result) return { success: false, error: "Purchase not found" };
    return { success: true };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Unknown error" }; }
}
