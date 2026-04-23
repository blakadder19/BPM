"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  globalScanChannelName,
  GLOBAL_SCAN_EVENT,
  HEARTBEAT_INTERVAL_MS,
  type GlobalScanBroadcast,
  type GlobalScanResult,
} from "@/lib/domain/scan-receiver";
import {
  registerReceiverAction,
  heartbeatReceiverAction,
  unregisterReceiverAction,
} from "@/lib/actions/scan-receiver";
import { GlobalScanOverlay } from "./global-scan-overlay";

interface GlobalScanReceiverProps {
  userId: string;
}

function generateReceiverId(): string {
  return crypto.randomUUID();
}

/** Cooldown (ms) during which repeated broadcasts of the same entity are ignored. */
const DUPLICATE_SUPPRESS_MS = 3_000;

/**
 * Derives a stable key for duplicate detection across repeated scans of the
 * same QR / same resolved entity.
 */
function getResultKey(result: GlobalScanResult): string {
  if (result.type === "student") {
    return `student:${result.data.student?.id ?? "unknown"}`;
  }
  if (result.type === "event_guest") {
    return `guest:${result.data.purchase?.id ?? "unknown"}`;
  }
  return `error:${result.message}`;
}

/**
 * Route-aware gate. The mobile /scan page is sender-only and MUST NOT act as
 * a receiver (register, heartbeat, or become active receiver). By mounting
 * the receiver only off /scan, navigating to /scan unmounts the inner
 * component and its effect cleanup unregisters this tab.
 */
export function GlobalScanReceiver({ userId }: GlobalScanReceiverProps) {
  const pathname = usePathname();
  if (pathname?.startsWith("/scan")) return null;
  return <GlobalScanReceiverInner userId={userId} />;
}

/**
 * Mounts in the admin layout shell (except /scan). Registers this browser
 * tab as the active scan receiver, subscribes to the Supabase Realtime
 * broadcast channel, and shows a global overlay when scan results arrive.
 */
function GlobalScanReceiverInner({ userId }: GlobalScanReceiverProps) {
  const receiverIdRef = useRef<string>("");
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scanResult, setScanResult] = useState<GlobalScanResult | null>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyAtRef = useRef<number>(0);

  useEffect(() => {
    const rid = generateReceiverId();
    receiverIdRef.current = rid;

    registerReceiverAction(rid);

    const supabase = createClient();
    const channelName = globalScanChannelName(userId);
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: GLOBAL_SCAN_EVENT }, (payload) => {
        const broadcast = payload.payload as GlobalScanBroadcast;

        if (broadcast.targetReceiverId && broadcast.targetReceiverId !== rid) {
          return;
        }

        // Duplicate suppression: latest-scan-wins, but ignore the same
        // resolved entity arriving within DUPLICATE_SUPPRESS_MS.
        const key = getResultKey(broadcast.result);
        const now = Date.now();
        if (
          lastKeyRef.current === key &&
          now - lastKeyAtRef.current < DUPLICATE_SUPPRESS_MS
        ) {
          lastKeyAtRef.current = now;
          return;
        }
        lastKeyRef.current = key;
        lastKeyAtRef.current = now;

        setScanResult(broadcast.result);

        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        autoDismissRef.current = setTimeout(() => setScanResult(null), 30_000);
      })
      .subscribe();

    channelRef.current = channel;

    heartbeatRef.current = setInterval(() => {
      heartbeatReceiverAction(rid);
    }, HEARTBEAT_INTERVAL_MS);

    function handleFocus() {
      registerReceiverAction(rid);
    }
    window.addEventListener("focus", handleFocus);

    function handleBeforeUnload() {
      navigator.sendBeacon?.(
        "/api/scan-receiver-unregister",
        JSON.stringify({ receiverId: rid }),
      );
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      unregisterReceiverAction(rid);
    };
  }, [userId]);

  const handleClose = useCallback(() => {
    setScanResult(null);
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
  }, []);

  if (!scanResult) return null;

  return <GlobalScanOverlay result={scanResult} onClose={handleClose} />;
}
