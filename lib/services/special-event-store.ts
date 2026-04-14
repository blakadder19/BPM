/**
 * Mutable in-memory store for special events, sessions, products, and purchases.
 * Starts empty when Supabase is configured; seeded from mock data otherwise.
 */

import {
  SPECIAL_EVENTS,
  EVENT_SESSIONS,
  EVENT_PRODUCTS,
  EVENT_PURCHASES,
  type MockSpecialEvent,
  type MockEventSession,
  type MockEventProduct,
  type MockEventPurchase,
} from "@/lib/mock-data";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const g = globalThis as unknown as {
  __bpm_specialEvents?: MockSpecialEvent[];
  __bpm_eventSessions?: MockEventSession[];
  __bpm_eventProducts?: MockEventProduct[];
  __bpm_eventPurchases?: MockEventPurchase[];
};

function initEvents(): MockSpecialEvent[] {
  if (!g.__bpm_specialEvents) {
    g.__bpm_specialEvents = hasSupabaseConfig() ? [] : SPECIAL_EVENTS.map((e) => ({ ...e }));
  }
  return g.__bpm_specialEvents;
}

function initSessions(): MockEventSession[] {
  if (!g.__bpm_eventSessions) {
    g.__bpm_eventSessions = hasSupabaseConfig() ? [] : EVENT_SESSIONS.map((s) => ({ ...s }));
  }
  return g.__bpm_eventSessions;
}

function initProducts(): MockEventProduct[] {
  if (!g.__bpm_eventProducts) {
    g.__bpm_eventProducts = hasSupabaseConfig() ? [] : EVENT_PRODUCTS.map((p) => ({ ...p }));
  }
  return g.__bpm_eventProducts;
}

function initPurchases(): MockEventPurchase[] {
  if (!g.__bpm_eventPurchases) {
    g.__bpm_eventPurchases = hasSupabaseConfig() ? [] : EVENT_PURCHASES.map((p) => ({ ...p }));
  }
  return g.__bpm_eventPurchases;
}

// ── Events ───────────────────────────────────────────────────

export function getEvents(): MockSpecialEvent[] { return initEvents(); }
export function getEvent(id: string) { return initEvents().find((e) => e.id === id); }

export function addEvent(evt: MockSpecialEvent) { initEvents().push(evt); return evt; }

export function patchEvent(id: string, patch: Partial<MockSpecialEvent>): MockSpecialEvent | null {
  const e = initEvents().find((x) => x.id === id);
  if (!e) return null;
  Object.assign(e, patch, { updatedAt: new Date().toISOString() });
  return { ...e };
}

export function removeEvent(id: string): boolean {
  const list = initEvents();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  const sessions = initSessions();
  for (let i = sessions.length - 1; i >= 0; i--) { if (sessions[i].eventId === id) sessions.splice(i, 1); }
  const products = initProducts();
  for (let i = products.length - 1; i >= 0; i--) { if (products[i].eventId === id) products.splice(i, 1); }
  return true;
}

// ── Sessions ─────────────────────────────────────────────────

export function getSessionsForEvent(eventId: string) {
  return initSessions().filter((s) => s.eventId === eventId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function addSession(s: MockEventSession) { initSessions().push(s); return s; }

export function patchSession(id: string, patch: Partial<MockEventSession>): MockEventSession | null {
  const s = initSessions().find((x) => x.id === id);
  if (!s) return null;
  Object.assign(s, patch);
  return { ...s };
}

export function removeSession(id: string): boolean {
  const list = initSessions();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// ── Event Products ───────────────────────────────────────────

export function getProductsForEvent(eventId: string) {
  return initProducts().filter((p) => p.eventId === eventId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEventProduct(id: string) { return initProducts().find((p) => p.id === id); }

export function addEventProduct(p: MockEventProduct) { initProducts().push(p); return p; }

export function patchEventProduct(id: string, patch: Partial<MockEventProduct>): MockEventProduct | null {
  const p = initProducts().find((x) => x.id === id);
  if (!p) return null;
  Object.assign(p, patch);
  return { ...p };
}

export function removeEventProduct(id: string): boolean {
  const list = initProducts();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  return true;
}

// ── Purchases ────────────────────────────────────────────────

export function getPurchasesForEvent(eventId: string) {
  return initPurchases().filter((p) => p.eventId === eventId);
}

export function getPurchasesForStudent(studentId: string) {
  return initPurchases().filter((p) => p.studentId === studentId);
}

export function getPurchaseByQrToken(token: string): MockEventPurchase | null {
  return initPurchases().find((p) => p.qrToken === token) ?? null;
}

export function addPurchase(p: MockEventPurchase) { initPurchases().push(p); return p; }

export function patchPurchase(id: string, patch: Partial<MockEventPurchase>): MockEventPurchase | null {
  const p = initPurchases().find((x) => x.id === id);
  if (!p) return null;
  Object.assign(p, patch);
  return { ...p };
}
