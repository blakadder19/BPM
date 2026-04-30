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
import { useScanReceiverStatus } from "@/components/providers/scan-receiver-status-provider";
import { GlobalScanOverlay, type GlobalScanOverlayPermissions } from "./global-scan-overlay";

interface GlobalScanReceiverProps {
  userId: string;
  permissions: GlobalScanOverlayPermissions;
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
export function GlobalScanReceiver({ userId, permissions }: GlobalScanReceiverProps) {
  const pathname = usePathname();
  const { setStatus } = useScanReceiverStatus();
  const gated = pathname?.startsWith("/scan");

  // Ensure status reflects "not-mounted" reality on /scan. Without this, a
  // prior "ready" state from /dashboard would linger after navigation.
  useEffect(() => {
    if (gated) setStatus("idle");
  }, [gated, setStatus]);

  if (gated) return null;
  return <GlobalScanReceiverInner userId={userId} permissions={permissions} />;
}

/**
 * Mounts in the admin layout shell (except /scan). Registers this browser
 * tab as the active scan receiver, subscribes to the Supabase Realtime
 * broadcast channel, and shows a global overlay when scan results arrive.
 */
function GlobalScanReceiverInner({ userId, permissions }: GlobalScanReceiverProps) {
  const receiverIdRef = useRef<string>("");
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scanResult, setScanResult] = useState<GlobalScanResult | null>(null);
  const [suppressedCount, setSuppressedCount] = useState(0);
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyAtRef = useRef<number>(0);
  // Mirror of scanResult for the broadcast callback closure; keeps the
  // broadcast handler free of stale-state bugs without having to re-subscribe
  // every time `scanResult` changes.
  const scanResultRef = useRef<GlobalScanResult | null>(null);
  useEffect(() => {
    scanResultRef.current = scanResult;
  }, [scanResult]);
  const { setStatus } = useScanReceiverStatus();

  const tryRegister = useCallback(
    async (rid: string) => {
      try {
        const res = await registerReceiverAction(rid);
        if (res?.success) {
          setStatus("ready", { receiverId: rid });
          return true;
        }
        setStatus("error", {
          receiverId: rid,
          errorMessage: res?.error ?? "Registration failed",
        });
        return false;
      } catch (err) {
        console.error("[GlobalScanReceiver] register threw:", err);
        setStatus("error", {
          receiverId: rid,
          errorMessage: err instanceof Error ? err.message : "Registration threw",
        });
        return false;
      }
    },
    [setStatus],
  );

  useEffect(() => {
    const rid = generateReceiverId();
    receiverIdRef.current = rid;
    setStatus("connecting", { receiverId: rid });

    void tryRegister(rid);

    const supabase = createClient();
    const channelName = globalScanChannelName(userId);
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: GLOBAL_SCAN_EVENT }, (payload) => {
        const broadcast = payload.payload as GlobalScanBroadcast;

        if (broadcast.targetReceiverId && broadcast.targetReceiverId !== rid) {
          return;
        }

        // While an overlay is already open the admin is mid-operation for a
        // specific student. Silently replacing the modal would lose that
        // context, so we block new scans until the admin explicitly clicks
        // "Next scan" or "Close". This is the simplest safe behavior
        // (block + counter) — no queue, no auto-replace.
        if (scanResultRef.current) {
          setSuppressedCount((n) => n + 1);
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
        // No auto-dismiss — admin stays in control until Close/Next scan.
      })
      .subscribe();

    channelRef.current = channel;

    heartbeatRef.current = setInterval(async () => {
      try {
        const res = await heartbeatReceiverAction(rid);
        if (res?.orphaned) {
          // Row was deleted or overwritten — reclaim the slot.
          await tryRegister(rid);
          return;
        }
        if (!res?.success) {
          setStatus("error", {
            receiverId: rid,
            errorMessage: res?.error ?? "Heartbeat failed",
          });
        }
      } catch (err) {
        console.error("[GlobalScanReceiver] heartbeat threw:", err);
        setStatus("error", {
          receiverId: rid,
          errorMessage: err instanceof Error ? err.message : "Heartbeat threw",
        });
      }
    }, HEARTBEAT_INTERVAL_MS);

    function handleFocus() {
      void tryRegister(rid);
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
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      unregisterReceiverAction(rid);
      setStatus("idle", { receiverId: null });
    };
  }, [userId, setStatus, tryRegister]);

  const handleClose = useCallback(() => {
    setScanResult(null);
    setSuppressedCount(0);
    // Reset duplicate-suppression window so the NEXT scan (even if it's the
    // same entity) is not treated as a repeat after the admin closed the
    // modal.
    lastKeyRef.current = null;
    lastKeyAtRef.current = 0;
  }, []);

  const handleNextScan = useCallback(() => {
    setScanResult(null);
    setSuppressedCount(0);
    lastKeyRef.current = null;
    lastKeyAtRef.current = 0;
  }, []);

  return (
    <GlobalScanOverlay
      result={scanResult}
      onClose={handleClose}
      onNextScan={handleNextScan}
      suppressedCount={suppressedCount}
      permissions={permissions}
    />
  );
}
