"use client";

import { useState, useTransition, useCallback } from "react";
import { Smartphone, Link2, CheckCircle2, XCircle, QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinScanSession, processPairedScan } from "@/lib/actions/paired-scan";
import { useScanChannel } from "@/lib/hooks/use-scan-channel";
import type { ScanSession, PairedScanResult } from "@/lib/domain/scan-session";

import dynamic from "next/dynamic";
const QrScanner = dynamic(
  () => import("@/components/attendance/qr-scanner").then((m) => m.QrScanner),
  { ssr: false },
);

type Phase = "pairing" | "scanning";

export function MobileScanner({ initialCode }: { initialCode?: string }) {
  const [phase, setPhase] = useState<Phase>(initialCode ? "pairing" : "pairing");
  const [codeInput, setCodeInput] = useState(initialCode ?? "");
  const [session, setSession] = useState<ScanSession | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [lastResult, setLastResult] = useState<PairedScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isProcessing, startProcessing] = useTransition();

  const { broadcast } = useScanChannel(session?.id ?? null, () => {});

  const handleJoin = useCallback(() => {
    setJoinError(null);
    startTransition(async () => {
      const code = codeInput.toUpperCase().trim();
      if (!code) {
        setJoinError("Enter a pairing code");
        return;
      }
      const res = await joinScanSession(code);
      if (res.success && res.session) {
        setSession(res.session);
        setPhase("scanning");
      } else {
        setJoinError(res.error ?? "Failed to join");
      }
    });
  }, [codeInput]);

  const isSessionError = useCallback((msg: string) => {
    const lower = msg.toLowerCase();
    return lower.includes("pairing session") || lower.includes("login session") || lower.includes("not authorized");
  }, []);

  const handleResetToPairing = useCallback(() => {
    setSession(null);
    setPhase("pairing");
    setCodeInput("");
    setScanError(null);
    setLastResult(null);
  }, []);

  const handleScan = useCallback(
    (qrCode: string) => {
      if (!session || isProcessing) return;
      setScanError(null);
      setLastResult(null);

      startProcessing(async () => {
        const res = await processPairedScan({ sessionId: session.id, qrCode });
        if (res.success && res.result) {
          setLastResult(res.result);
          await broadcast(res.result);
        } else {
          setScanError(res.error ?? "Scan processing failed");
        }
      });
    },
    [session, isProcessing, broadcast],
  );

  if (phase === "pairing") {
    return (
      <div className="mx-auto max-w-sm space-y-6 py-8 px-4">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-bpm-100">
            <Link2 className="h-7 w-7 text-bpm-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Pair Scanner</h1>
          <p className="text-sm text-gray-500">
            Enter the pairing code shown on the laptop to connect this device as a scanner.
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="e.g. AB3X92"
            maxLength={6}
            className="w-full rounded-xl border border-gray-300 px-4 py-4 text-center text-2xl font-mono tracking-widest uppercase placeholder:text-gray-300 focus:border-bpm-500 focus:ring-1 focus:ring-bpm-500"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
          />
          <Button
            onClick={handleJoin}
            disabled={isPending || !codeInput.trim()}
            className="w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Smartphone className="h-4 w-4 mr-1.5" />
                Connect
              </>
            )}
          </Button>
          {joinError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {joinError}
            </div>
          )}
        </div>
      </div>
    );
  }

  const contextLabel =
    session?.contextType === "event_reception"
      ? "Event Reception"
      : "Attendance";

  return (
    <div className="mx-auto max-w-sm space-y-4 py-4 px-4">
      {/* Status header */}
      <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-green-800">
            Connected — {contextLabel}
          </span>
        </div>
        <span className="text-xs font-mono text-green-600">{session?.pairingCode}</span>
      </div>

      {/* Scanner */}
      <QrScanner onScan={handleScan} active={!isProcessing} />

      {isProcessing && (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-bpm-50 border border-bpm-200 p-3">
          <Loader2 className="h-4 w-4 animate-spin text-bpm-600" />
          <span className="text-sm text-bpm-700 font-medium">Processing scan...</span>
        </div>
      )}

      {/* Last result */}
      {lastResult && !isProcessing && (
        <div className={`rounded-xl border-2 p-4 space-y-1 ${
          lastResult.payload.success
            ? "border-green-300 bg-green-50"
            : "border-red-300 bg-red-50"
        }`}>
          <div className="flex items-center gap-2">
            {lastResult.payload.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <span className={`text-sm font-semibold ${
              lastResult.payload.success ? "text-green-800" : "text-red-800"
            }`}>
              {lastResult.payload.success ? "Scan sent to laptop" : "Scan failed"}
            </span>
          </div>
          {lastResult.payload.error && (
            <p className="text-xs text-red-600 pl-7">{lastResult.payload.error}</p>
          )}
          <p className="text-xs text-gray-500 pl-7">
            Ready for next scan
          </p>
        </div>
      )}

      {scanError && !isProcessing && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-2">
          <p className="text-sm text-red-700">{scanError}</p>
          {isSessionError(scanError) && (
            <button
              type="button"
              onClick={handleResetToPairing}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 w-full justify-center"
            >
              <Link2 className="h-4 w-4" />
              Re-pair scanner
            </button>
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
