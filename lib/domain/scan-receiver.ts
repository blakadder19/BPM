/**
 * Global scan receiver domain types and helpers.
 *
 * A "receiver" is a laptop browser tab that is registered to receive
 * QR scan results from the admin's mobile device via Supabase Realtime
 * Broadcast. The channel is keyed by user ID — no manual pairing needed.
 */

import type { QrLookupResult, GuestPurchaseQrResult } from "@/lib/actions/qr-checkin";

// ── Types ────────────────────────────────────────────────────

export interface ScanReceiver {
  id: string;
  userId: string;
  receiverId: string;
  lastHeartbeat: string;
  createdAt: string;
}

/** Result of a global scan, sent from mobile to laptop via Realtime. */
export type GlobalScanResult =
  | { type: "student"; data: QrLookupResult }
  | { type: "event_guest"; data: GuestPurchaseQrResult }
  | { type: "error"; message: string };

/** Payload shape broadcast over the Realtime channel. */
export interface GlobalScanBroadcast {
  targetReceiverId: string;
  result: GlobalScanResult;
  timestamp: string;
}

// ── Channel helpers ──────────────────────────────────────────

export function globalScanChannelName(userId: string): string {
  return `admin-scan:${userId}`;
}

export const GLOBAL_SCAN_EVENT = "global_scan_result";

// ── Heartbeat ────────────────────────────────────────────────

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const HEARTBEAT_STALE_MS = 120_000;

export function isReceiverStale(receiver: ScanReceiver): boolean {
  const age = Date.now() - new Date(receiver.lastHeartbeat).getTime();
  return age > HEARTBEAT_STALE_MS;
}
