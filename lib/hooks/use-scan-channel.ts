"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  scanChannelName,
  SCAN_RESULT_EVENT,
  type PairedScanResult,
} from "@/lib/domain/scan-session";

/**
 * Subscribe to a Supabase Realtime Broadcast channel for paired scanning.
 * Fires `onResult` each time a scan_result event is received.
 *
 * Usage:
 *   const { broadcast } = useScanChannel(sessionId, (result) => { ... });
 *   // Mobile calls: broadcast(result);
 *   // Laptop just listens via the callback.
 */
export function useScanChannel(
  sessionId: string | null,
  onResult: (result: PairedScanResult) => void,
) {
  const callbackRef = useRef(onResult);
  callbackRef.current = onResult;

  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const supabase = createClient();
    const channelName = scanChannelName(sessionId);
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: SCAN_RESULT_EVENT }, (payload) => {
        const result = payload.payload as PairedScanResult;
        callbackRef.current(result);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId]);

  const broadcast = useCallback(
    async (result: PairedScanResult) => {
      if (!channelRef.current) return;
      await channelRef.current.send({
        type: "broadcast",
        event: SCAN_RESULT_EVENT,
        payload: result,
      });
    },
    [],
  );

  return { broadcast };
}
