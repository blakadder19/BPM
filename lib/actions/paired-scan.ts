"use server";

import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/auth";
import {
  generatePairingCode,
  isValidPairingCode,
  isSessionExpired,
  type ScanSession,
  type ScanContextType,
  type PairedScanResult,
} from "@/lib/domain/scan-session";
import { lookupStudentByQr, type QrLookupResult } from "@/lib/actions/qr-checkin";
import { eventQrLookup, type EventQrLookupResult } from "@/lib/actions/event-checkin";

// ── DB helpers (untyped admin client — scan_sessions is not in the generated Database type) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cached: any = null;
function db() {
  if (_cached) return _cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  _cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _cached;
}

function rowToSession(row: Record<string, unknown>): ScanSession {
  return {
    id: row.id as string,
    pairingCode: row.pairing_code as string,
    contextType: row.context_type as ScanContextType,
    contextId: (row.context_id as string) ?? null,
    createdBy: row.created_by as string,
    active: row.active as boolean,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
  };
}

// ── Create session ───────────────────────────────────────────

export interface CreateSessionResult {
  success: boolean;
  error?: string;
  session?: ScanSession;
}

export async function createPairedScanSession(input: {
  contextType: ScanContextType;
  contextId?: string;
}): Promise<CreateSessionResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  // Deactivate any existing active sessions for this user + context
  await db()
    .from("scan_sessions")
    .update({ active: false })
    .eq("created_by", user.id)
    .eq("active", true);

  const pairingCode = generatePairingCode();

  const { data, error } = await db()
    .from("scan_sessions")
    .insert({
      pairing_code: pairingCode,
      context_type: input.contextType,
      context_id: input.contextId ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[paired-scan] Failed to create session:", error?.message);
    return { success: false, error: "Failed to create scan session" };
  }

  return { success: true, session: rowToSession(data) };
}

// ── Join session (mobile enters pairing code) ────────────────

export interface JoinSessionResult {
  success: boolean;
  error?: string;
  session?: ScanSession;
}

export async function joinScanSession(pairingCode: string): Promise<JoinSessionResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  const code = pairingCode.toUpperCase().trim();
  if (!isValidPairingCode(code)) {
    return { success: false, error: "Invalid pairing code format" };
  }

  const { data, error } = await db()
    .from("scan_sessions")
    .select()
    .eq("pairing_code", code)
    .eq("active", true)
    .single();

  if (error || !data) {
    return { success: false, error: "Session not found or expired" };
  }

  const session = rowToSession(data);
  if (isSessionExpired(session)) {
    await db().from("scan_sessions").update({ active: false }).eq("id", session.id);
    return { success: false, error: "Session has expired" };
  }

  return { success: true, session };
}

// ── Process a scan from paired mobile ────────────────────────

export interface ProcessScanResult {
  success: boolean;
  error?: string;
  result?: PairedScanResult;
}

export async function processPairedScan(input: {
  sessionId: string;
  qrCode: string;
}): Promise<ProcessScanResult> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  const { data, error } = await db()
    .from("scan_sessions")
    .select()
    .eq("id", input.sessionId)
    .eq("active", true)
    .single();

  if (error || !data) {
    return { success: false, error: "Session not found or inactive" };
  }

  const session = rowToSession(data);
  if (isSessionExpired(session)) {
    await db().from("scan_sessions").update({ active: false }).eq("id", session.id);
    return { success: false, error: "Session has expired" };
  }

  const timestamp = new Date().toISOString();

  if (session.contextType === "attendance") {
    const lookupResult: QrLookupResult = await lookupStudentByQr(input.qrCode);
    const result: PairedScanResult = {
      sessionId: session.id,
      contextType: "attendance",
      contextId: session.contextId,
      timestamp,
      payload: {
        type: "attendance",
        success: lookupResult.success,
        error: lookupResult.error,
        data: lookupResult.success ? lookupResult : undefined,
      },
    };
    return { success: true, result };
  }

  if (session.contextType === "event_reception") {
    if (!session.contextId) {
      return { success: false, error: "Session is missing event ID" };
    }
    const lookupResult: EventQrLookupResult = await eventQrLookup(
      input.qrCode,
      session.contextId,
      user.id,
    );
    const result: PairedScanResult = {
      sessionId: session.id,
      contextType: "event_reception",
      contextId: session.contextId,
      timestamp,
      payload: {
        type: "event_reception",
        success: lookupResult.success,
        error: lookupResult.error,
        data: lookupResult.success ? lookupResult : undefined,
      },
    };
    return { success: true, result };
  }

  return { success: false, error: `Unknown context type: ${session.contextType}` };
}

// ── Close session ────────────────────────────────────────────

export async function closeScanSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    return { success: false, error: "Not authorized" };
  }

  const { error } = await db()
    .from("scan_sessions")
    .update({ active: false })
    .eq("id", sessionId);

  if (error) {
    console.error("[paired-scan] Failed to close session:", error.message);
    return { success: false, error: "Failed to close session" };
  }

  return { success: true };
}
