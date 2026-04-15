import * as store from "@/lib/services/special-event-store";
import { generateId } from "@/lib/utils";
import type {
  ISpecialEventRepository,
  CreateEventData,
  EventPatch,
  CreateSessionData,
  SessionPatch,
  CreateEventProductData,
  EventProductPatch,
  CreatePurchaseData,
} from "../interfaces/special-event-repository";
import type { EventPaymentStatus } from "@/types/domain";

export const memorySpecialEventRepo: ISpecialEventRepository = {
  // ── Events ───────────────────────────────────────────────
  async getAllEvents() { return store.getEvents(); },
  async getEventById(id) { return store.getEvent(id) ?? null; },

  async createEvent(data: CreateEventData) {
    const now = new Date().toISOString();
    return store.addEvent({
      id: generateId("evt"),
      title: data.title,
      subtitle: data.subtitle ?? null,
      description: data.description,
      coverImageUrl: data.coverImageUrl ?? null,
      location: data.location,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status ?? "draft",
      isVisible: data.isVisible ?? false,
      isFeatured: data.isFeatured ?? false,
      featuredOnDashboard: data.featuredOnDashboard ?? false,
      isPublic: data.isPublic ?? false,
      salesOpen: data.salesOpen ?? false,
      overallCapacity: data.overallCapacity ?? null,
      allowReceptionPayment: data.allowReceptionPayment ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },

  async updateEvent(id, patch: EventPatch) { return store.patchEvent(id, patch); },
  async deleteEvent(id) { return store.removeEvent(id); },

  // ── Sessions ─────────────────────────────────────────────
  async getSessionsByEvent(eventId) { return store.getSessionsForEvent(eventId); },

  async createSession(data: CreateSessionData) {
    return store.addSession({
      id: generateId("es"),
      eventId: data.eventId,
      title: data.title,
      sessionType: data.sessionType,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      teacherName: data.teacherName ?? null,
      room: data.room ?? null,
      capacity: data.capacity ?? null,
      description: data.description ?? null,
      sortOrder: data.sortOrder ?? 0,
    });
  },

  async updateSession(id, patch: SessionPatch) { return store.patchSession(id, patch); },
  async deleteSession(id) { return store.removeSession(id); },

  // ── Event Products ───────────────────────────────────────
  async getProductsByEvent(eventId) { return store.getProductsForEvent(eventId); },

  async createEventProduct(data: CreateEventProductData) {
    return store.addEventProduct({
      id: generateId("ep"),
      eventId: data.eventId,
      name: data.name,
      description: data.description ?? null,
      priceCents: data.priceCents,
      productType: data.productType,
      isVisible: data.isVisible ?? true,
      salesOpen: data.salesOpen ?? false,
      inclusionRule: data.inclusionRule,
      includedSessionIds: data.includedSessionIds ?? null,
      sortOrder: data.sortOrder ?? 0,
    });
  },

  async updateEventProduct(id, patch: EventProductPatch) { return store.patchEventProduct(id, patch); },
  async deleteEventProduct(id) { return store.removeEventProduct(id); },

  // ── Purchases ────────────────────────────────────────────
  async getPurchasesByEvent(eventId) { return store.getPurchasesForEvent(eventId); },
  async getPurchasesByStudent(studentId) { return store.getPurchasesForStudent(studentId); },
  async getPurchaseByQrToken(token) { return store.getPurchaseByQrToken(token); },

  async createPurchase(data: CreatePurchaseData) {
    const now = new Date().toISOString();
    return store.addPurchase({
      id: generateId("epur"),
      studentId: data.studentId,
      eventProductId: data.eventProductId,
      eventId: data.eventId,
      guestName: data.guestName ?? null,
      guestEmail: data.guestEmail ?? null,
      guestPhone: data.guestPhone ?? null,
      qrToken: data.qrToken ?? null,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus ?? "pending",
      paymentReference: data.paymentReference ?? null,
      receptionMethod: null,
      purchasedAt: now,
      paidAt: data.paymentStatus === "paid" ? now : null,
      notes: data.notes ?? null,
      unitPriceCentsAtPurchase: data.unitPriceCentsAtPurchase ?? null,
      originalAmountCents: data.originalAmountCents ?? null,
      discountAmountCents: data.discountAmountCents ?? 0,
      paidAmountCents: data.paidAmountCents ?? null,
      currency: data.currency ?? "eur",
      productNameSnapshot: data.productNameSnapshot ?? null,
      productTypeSnapshot: data.productTypeSnapshot ?? null,
      checkedInAt: null,
      checkedInBy: null,
      lastEmailType: null,
      lastEmailSentAt: null,
      lastEmailSuccess: null,
    });
  },

  async updatePurchasePayment(id, patch: { paymentStatus: EventPaymentStatus; paymentReference?: string | null; receptionMethod?: string | null; paidAt?: string | null; qrToken?: string | null; paidAmountCents?: number | null }) {
    return store.patchPurchase(id, {
      paymentStatus: patch.paymentStatus,
      ...(patch.paymentReference !== undefined ? { paymentReference: patch.paymentReference } : {}),
      ...(patch.receptionMethod !== undefined ? { receptionMethod: patch.receptionMethod } : {}),
      ...(patch.paidAt !== undefined ? { paidAt: patch.paidAt } : {}),
      ...(patch.paidAmountCents !== undefined ? { paidAmountCents: patch.paidAmountCents } : {}),
      ...(patch.qrToken !== undefined ? { qrToken: patch.qrToken } : {}),
    });
  },

  async updatePurchaseCheckIn(id, patch: { checkedInAt: string | null; checkedInBy: string | null }) {
    return store.patchPurchase(id, {
      checkedInAt: patch.checkedInAt,
      checkedInBy: patch.checkedInBy,
    });
  },

  async updatePurchaseEmailTracking(id, patch: { lastEmailType: string; lastEmailSentAt: string; lastEmailSuccess: boolean }) {
    store.patchPurchase(id, {
      lastEmailType: patch.lastEmailType,
      lastEmailSentAt: patch.lastEmailSentAt,
      lastEmailSuccess: patch.lastEmailSuccess,
    });
  },
};
