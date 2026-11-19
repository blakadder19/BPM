import { randomUUID } from "node:crypto";
import type { ReceiptTokenRecord } from "@/lib/domain/receipt-token";
import type { IReceiptTokenRepository, RotateReceiptTokenInput } from "../interfaces/receipt-token-repository";

const g = globalThis as unknown as { __bpm_receiptTokens?: ReceiptTokenRecord[] };

function store(): ReceiptTokenRecord[] {
  if (!g.__bpm_receiptTokens) g.__bpm_receiptTokens = [];
  return g.__bpm_receiptTokens;
}

export function resetMemoryReceiptTokens(): void {
  g.__bpm_receiptTokens = [];
}

function newRecord(input: RotateReceiptTokenInput, now: string): ReceiptTokenRecord {
  if (store().some((t) => t.tokenHash === input.tokenHash)) {
    throw new Error("Receipt token hash already exists.");
  }
  return {
    id: randomUUID(),
    eventPurchaseId: input.eventPurchaseId,
    tokenHash: input.tokenHash,
    issuedReason: input.issuedReason,
    createdBy: input.createdBy,
    createdAt: now,
    expiresAt: input.expiresAt,
    revokedAt: null,
    lastUsedAt: null,
  };
}

function activeFor(eventPurchaseId: string): ReceiptTokenRecord | undefined {
  return store().find((t) => t.eventPurchaseId === eventPurchaseId && !t.revokedAt);
}

export const memoryReceiptTokenRepo: IReceiptTokenRepository = {
  async rotateForEventPurchase(input) {
    const now = new Date().toISOString();
    const record = newRecord(input, now);
    for (const t of store()) {
      if (t.eventPurchaseId === input.eventPurchaseId && !t.revokedAt) t.revokedAt = now;
    }
    store().push(record);
    return { ...record };
  },

  async insertIfNoActive(input) {
    if (activeFor(input.eventPurchaseId)) return null;
    const record = newRecord(input, new Date().toISOString());
    store().push(record);
    return { ...record };
  },

  async findByHash(tokenHash) {
    const t = store().find((r) => r.tokenHash === tokenHash);
    return t ? { ...t } : null;
  },

  async findActiveForEventPurchase(eventPurchaseId) {
    const t = activeFor(eventPurchaseId);
    return t ? { ...t } : null;
  },

  async listPurchasesWithActiveToken(eventPurchaseIds) {
    const wanted = new Set(eventPurchaseIds);
    return new Set(store().filter((t) => !t.revokedAt && wanted.has(t.eventPurchaseId)).map((t) => t.eventPurchaseId));
  },

  async revokeById(id, atIso) {
    const t = store().find((r) => r.id === id);
    if (t && !t.revokedAt) t.revokedAt = atIso;
  },

  async reinstate(id) {
    const t = store().find((r) => r.id === id);
    if (!t || !t.revokedAt || activeFor(t.eventPurchaseId)) return false;
    t.revokedAt = null;
    return true;
  },

  async revokeAllForEventPurchase(eventPurchaseId) {
    const now = new Date().toISOString();
    let n = 0;
    for (const t of store()) {
      if (t.eventPurchaseId === eventPurchaseId && !t.revokedAt) {
        t.revokedAt = now;
        n += 1;
      }
    }
    return n;
  },

  async touchLastUsed(id, atIso) {
    const t = store().find((r) => r.id === id);
    if (t) t.lastUsedAt = atIso;
  },
};
