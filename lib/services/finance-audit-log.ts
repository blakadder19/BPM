/**
 * Lightweight financial audit log.
 *
 * Records important state changes for financial entities (subscriptions,
 * event purchases, penalties) so admins can trace what happened operationally.
 *
 * Dual-write: in-memory for immediate access + Supabase for persistence.
 * On hydration, the in-memory store is replaced with DB contents.
 */

import { generateId } from "@/lib/utils";
import { saveAuditEntryToDB } from "@/lib/supabase/operational-persistence";

export type AuditAction =
  | "created"
  | "marked_paid"
  | "marked_pending"
  | "refunded"
  | "waived"
  | "cancelled"
  | "renewed"
  | "status_changed"
  | "manual_edit";

export interface FinanceAuditEntry {
  id: string;
  entityType: "subscription" | "event_purchase" | "penalty";
  entityId: string;
  action: AuditAction;
  performedBy: string | null;
  detail: string | null;
  previousValue: string | null;
  newValue: string | null;
  createdAt: string;
}

const g = globalThis as unknown as { __bpm_finance_audit?: FinanceAuditEntry[] };

function store(): FinanceAuditEntry[] {
  if (!g.__bpm_finance_audit) g.__bpm_finance_audit = [];
  return g.__bpm_finance_audit;
}

/**
 * Replace the in-memory store with entries loaded from Supabase.
 * Called during hydration to ensure audit data survives restarts.
 */
export function hydrateAuditLog(entries: FinanceAuditEntry[]): void {
  const s = store();
  s.length = 0;
  s.push(...entries);
}

export function logFinanceEvent(params: {
  entityType: FinanceAuditEntry["entityType"];
  entityId: string;
  action: AuditAction;
  performedBy?: string | null;
  detail?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
}): FinanceAuditEntry {
  const entry: FinanceAuditEntry = {
    id: generateId("fal"),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    performedBy: params.performedBy ?? null,
    detail: params.detail ?? null,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    createdAt: new Date().toISOString(),
  };
  store().push(entry);

  // Fire-and-forget persistence — non-blocking, logs on error
  saveAuditEntryToDB(entry).catch((e) =>
    console.warn("[finance-audit] persist failed:", e instanceof Error ? e.message : e),
  );

  return entry;
}

export function getAuditLog(): FinanceAuditEntry[] {
  return store();
}

export function getAuditLogForEntity(entityType: string, entityId: string): FinanceAuditEntry[] {
  return store().filter((e) => e.entityType === entityType && e.entityId === entityId);
}
