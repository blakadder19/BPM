/**
 * Paired-scan session domain types and helpers.
 *
 * A scan session links a laptop (operator console) to a mobile (QR scanner)
 * so that scans performed on mobile are processed server-side and the
 * results appear on the laptop in real time via Supabase Realtime Broadcast.
 */

// ── Types ────────────────────────────────────────────────────

export type ScanContextType = "attendance" | "event_reception";

export interface ScanSession {
  id: string;
  pairingCode: string;
  contextType: ScanContextType;
  contextId: string | null;
  createdBy: string;
  active: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface PairedScanResult {
  sessionId: string;
  contextType: ScanContextType;
  contextId: string | null;
  timestamp: string;
  /** Discriminated payload — shape depends on contextType */
  payload: AttendanceScanPayload | EventReceptionScanPayload;
}

export interface AttendanceScanPayload {
  type: "attendance";
  success: boolean;
  error?: string;
  /** Full QrLookupResult-compatible data (imported from qr-checkin) */
  data?: unknown;
}

export interface EventReceptionScanPayload {
  type: "event_reception";
  success: boolean;
  error?: string;
  /** Full EventQrLookupResult-compatible data (imported from event-checkin) */
  data?: unknown;
}

// ── Pairing code generation ──────────────────────────────────
// 6-char uppercase alphanumeric, excluding confusable characters.

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generatePairingCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function isValidPairingCode(code: string): boolean {
  return typeof code === "string" && /^[A-Z2-9]{6}$/.test(code);
}

// ── Realtime channel helpers ─────────────────────────────────

export function scanChannelName(sessionId: string): string {
  return `scan:${sessionId}`;
}

export const SCAN_RESULT_EVENT = "scan_result";

// ── Session expiry ───────────────────────────────────────────

export function isSessionExpired(session: ScanSession): boolean {
  return new Date(session.expiresAt) < new Date();
}
