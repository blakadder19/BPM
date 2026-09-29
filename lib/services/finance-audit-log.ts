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
import { isMemoryMode } from "@/lib/config/data-provider";

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

export interface LogFinanceEventParams {
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
  /**
   * Stable id for entries that may be re-written by a recovery.
   * Omit for ordinary events, which get a fresh id.
   */
  entryId?: string;
}

function buildEntry(params: LogFinanceEventParams): FinanceAuditEntry {
  const now = new Date().toISOString();
  const performer = params.performer ?? null;

  return {
    id: params.entryId ?? generateId("fal"),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    performedBy: params.performedBy ?? displayPerformer(performer),
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
}

/** Replace an entry with the same id, so a retry does not duplicate it. */
function upsertInMemory(entry: FinanceAuditEntry): void {
  const s = store();
  const i = s.findIndex((e) => e.id === entry.id);
  if (i >= 0) s[i] = entry;
  else s.push(entry);
}

export function logFinanceEvent(params: LogFinanceEventParams): FinanceAuditEntry {
  const entry = buildEntry(params);
  upsertInMemory(entry);

  // Fire-and-forget persistence — non-blocking, logs on error
  saveAuditEntryToDB(entry).catch((e) =>
    console.warn("[finance-audit] persist failed:", e instanceof Error ? e.message : e),
  );

  return entry;
}

export interface PersistedAuditResult {
  entry: FinanceAuditEntry;
  /** False when the row did not reach the database. */
  persisted: boolean;
  /** Stored, but without the structured performer fields. */
  degraded: boolean;
  error?: string;
}

/**
 * Same as `logFinanceEvent`, but AWAITS persistence and reports the
 * outcome.
 *
 * For operations sensitive enough that "it happened" and "we have a
 * durable record that it happened" must not be conflated — a
 * backdated correction moves a real credit, so the caller needs to
 * know whether the trail actually exists before telling an admin the
 * change was audited.
 */
export async function logFinanceEventAwaited(
  params: LogFinanceEventParams,
): Promise<PersistedAuditResult> {
  return persistAwaited(buildEntry(params));
}

/**
 * Entries whose awaited write failed, kept so a retry re-writes the
 * ORIGINAL entry (actor, detail, balances) instead of a reconstruction.
 * Per server instance: a retry on another instance falls back to
 * reconstructing what it can.
 */
function pendingStore(): Map<string, FinanceAuditEntry> {
  const g = globalThis as unknown as { __bpmPendingAudit?: Map<string, FinanceAuditEntry> };
  if (!g.__bpmPendingAudit) g.__bpmPendingAudit = new Map();
  return g.__bpmPendingAudit;
}

export function getPendingAuditEntry(id: string): FinanceAuditEntry | undefined {
  return pendingStore().get(id);
}

/**
 * The in-memory log only receives an entry once it is durable, so
 * "is it in the log?" can be trusted to mean "is it in the database?".
 * In memory mode the in-memory store IS the store of record.
 */
async function persistAwaited(entry: FinanceAuditEntry): Promise<PersistedAuditResult> {
  if (isMemoryMode()) {
    upsertInMemory(entry);
    return { entry, persisted: true, degraded: false };
  }

  let result: { persisted: boolean; degraded?: boolean; error?: string };
  try {
    result = await saveAuditEntryToDB(entry);
  } catch (e) {
    result = { persisted: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (result.persisted) {
    upsertInMemory(entry);
    pendingStore().delete(entry.id);
  } else {
    console.warn("[finance-audit] persist failed:", result.error);
    pendingStore().set(entry.id, entry);
  }
  return {
    entry,
    persisted: result.persisted,
    degraded: !!result.degraded,
    error: result.error,
  };
}

/** Re-attempt a previously failed entry exactly as it was built. */
export async function retryPendingAuditEntry(
  id: string,
): Promise<PersistedAuditResult | null> {
  const pending = pendingStore().get(id);
  return pending ? persistAwaited(pending) : null;
}

export function getAuditLog(): FinanceAuditEntry[] {
  return store();
}

export function getAuditLogForEntity(entityType: string, entityId: string): FinanceAuditEntry[] {
  return store().filter((e) => e.entityType === entityType && e.entityId === entityId);
}
