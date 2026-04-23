"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  QrCode,
  Loader2,
  MonitorOff,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getActiveReceiverAction,
  processGlobalScanAction,
} from "@/lib/actions/scan-receiver";
import {
  globalScanChannelName,
  GLOBAL_SCAN_EVENT,
  type GlobalScanBroadcast,
} from "@/lib/domain/scan-receiver";

import dynamic from "next/dynamic";
const QrScanner = dynamic(
  () => import("@/components/attendance/qr-scanner").then((m) => m.QrScanner),
  { ssr: false },
);

type Phase = "checking" | "no_receiver" | "scanning";

interface MobileScannerProps {
  userId: string;
}

export function MobileScanner({ userId }: MobileScannerProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [lastStatus, setLastStatus] = useState<"sent" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, startProcessing] = useTransition();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for active receiver on mount
  useEffect(() => {
    checkReceiver();
  }, []);

  // While in no_receiver state, poll every 3s so the phone auto-reconnects
  // as soon as the laptop finishes registration on its side.
  useEffect(() => {
    if (phase !== "no_receiver") return;
    const t = setInterval(() => {
      checkReceiver();
    }, 3_000);
    return () => clearInterval(t);
  }, [phase]);

  // Set up broadcast channel when we enter scanning phase
  useEffect(() => {
    if (phase !== "scanning") return;

    const supabase = createClient();
    const channelName = globalScanChannelName(userId);
    const channel = supabase.channel(channelName);
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [phase, userId]);

  async function checkReceiver() {
    setPhase("checking");
    const res = await getActiveReceiverAction();
    setPhase(res.active ? "scanning" : "no_receiver");
  }

  const handleScan = useCallback(
    (qrCode: string) => {
      if (isProcessing) return;
      setLastStatus(null);
      setErrorMessage(null);

      startProcessing(async () => {
        const res = await processGlobalScanAction(qrCode);

        if (!res.success) {
          setLastStatus("error");
          setErrorMessage(res.error ?? "Scan processing failed");
          return;
        }

        if (res.result && channelRef.current) {
          const broadcast: GlobalScanBroadcast = {
            targetReceiverId: res.targetReceiverId ?? "",
            result: res.result,
            timestamp: new Date().toISOString(),
          };

          await channelRef.current.send({
            type: "broadcast",
            event: GLOBAL_SCAN_EVENT,
            payload: broadcast,
          });

          setLastStatus("sent");
        } else if (!channelRef.current) {
          setLastStatus("error");
          setErrorMessage("No active laptop session — please open the app on your laptop first.");
          setPhase("no_receiver");
          return;
        }

        // Auto-reset status after 2s for next scan
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => {
          setLastStatus(null);
          setErrorMessage(null);
        }, 2000);
      });
    },
    [isProcessing],
  );

  // ── Checking phase ──
  if (phase === "checking") {
    return (
      <div className="mx-auto max-w-sm py-16 px-4 text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-bpm-600 mx-auto" />
        <p className="text-sm text-gray-500">Checking for active laptop session...</p>
      </div>
    );
  }

  // ── No receiver phase ──
  if (phase === "no_receiver") {
    return (
      <div className="mx-auto max-w-sm space-y-6 py-12 px-4">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <MonitorOff className="h-8 w-8 text-gray-400" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">No Active Laptop Session</h1>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            Open the BPM app on your laptop first. The laptop automatically registers as
            the scan receiver when any admin page is open.
          </p>
        </div>
        <Button onClick={checkReceiver} variant="outline" className="w-full">
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Check again
        </Button>
      </div>
    );
  }

  // ── Scanning phase ──
  return (
    <div className="mx-auto max-w-sm space-y-4 py-4 px-4">
      {/* Status header */}
      <div className="flex items-center justify-center rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-green-800">
            Connected — Scanner ready
          </span>
        </div>
      </div>

      {/* Scanner */}
      <QrScanner onScan={handleScan} active={!isProcessing} />

      {/* Processing state */}
      {isProcessing && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-bpm-50 border border-bpm-200 p-3">
          <Loader2 className="h-4 w-4 animate-spin text-bpm-600" />
          <span className="text-sm text-bpm-700 font-medium">Processing scan...</span>
        </div>
      )}

      {/* Sent confirmation */}
      {lastStatus === "sent" && !isProcessing && (
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-sm font-semibold text-green-800">Sent to laptop</span>
          </div>
          <p className="text-xs text-gray-500 mt-1 pl-7">
            Ready for next scan
          </p>
        </div>
      )}

      {/* Error state */}
      {lastStatus === "error" && !isProcessing && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-semibold text-red-800">Scan failed</span>
          </div>
          {errorMessage && (
            <p className="text-xs text-red-600 mt-1 pl-7">{errorMessage}</p>
          )}
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        <QrCode className="inline h-3 w-3 mr-1" />
        Point camera at QR code — results appear on the laptop
      </p>
    </div>
  );
}
