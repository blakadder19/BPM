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
  /**
   * Free-text display of who performed the action.
   * Prefers name, then email, then user id. Retained as a legacy display
   * field so existing rows still render correctly; new writes also populate
   * the structured identity fields below.
   */
  performedBy: string | null;
  /** Auth user id of whoever performed the action (structured attribution). */
  performedByUserId: string | null;
  /** Email captured at the time of the action. */
  performedByEmail: string | null;
  /** Display name captured at the time of the action. */
  performedByName: string | null;
  /** Explicit performed timestamp. Falls back to createdAt in legacy rows. */
  performedAt: string | null;
  detail: string | null;
  previousValue: string | null;
  newValue: string | null;
  /**
   * Phase 4: structured event metadata (e.g. applied discount snapshot).
   * NULL when an event has no structured payload.
   */
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditPerformer {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
}

/** Build a display string from structured identity, preferring name → email → id. */
export function displayPerformer(p: AuditPerformer | null | undefined): string | null {
  if (!p) return null;
  return p.name?.trim() || p.email?.trim() || p.userId?.trim() || null;
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
  /** Legacy free-text; if omitted it is derived from performer. */
  performedBy?: string | null;
  performer?: AuditPerformer | null;
  detail?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown> | null;
}): FinanceAuditEntry {
  const now = new Date().toISOString();
  const performer = params.performer ?? null;
  const derivedLegacy = params.performedBy ?? displayPerformer(performer);

  const entry: FinanceAuditEntry = {
    id: generateId("fal"),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    performedBy: derivedLegacy,
    performedByUserId: performer?.userId ?? null,
    performedByEmail: performer?.email ?? null,
    performedByName: performer?.name ?? null,
    performedAt: now,
    detail: params.detail ?? null,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    metadata: params.metadata ?? null,
    createdAt: now,
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
