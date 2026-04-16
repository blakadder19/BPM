"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Smartphone,
  Link2,
  Link2Off,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createPairedScanSession,
  closeScanSession,
} from "@/lib/actions/paired-scan";
import { useScanChannel } from "@/lib/hooks/use-scan-channel";
import type { ScanSession, ScanContextType, PairedScanResult } from "@/lib/domain/scan-session";

interface PairScannerControlsProps {
  contextType: ScanContextType;
  contextId?: string;
  onScanResult: (result: PairedScanResult) => void;
}

export function PairScannerControls({
  contextType,
  contextId,
  onScanResult,
}: PairScannerControlsProps) {
  const [session, setSession] = useState<ScanSession | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  useScanChannel(session?.id ?? null, (result) => {
    setScanCount((c) => c + 1);
    onScanResult(result);
  });

  const handleCreate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await createPairedScanSession({ contextType, contextId });
      if (res.success && res.session) {
        setSession(res.session);
        setScanCount(0);
      } else {
        setError(res.error ?? "Failed to create session");
      }
    });
  }, [contextType, contextId]);

  const handleClose = useCallback(() => {
    if (!session) return;
    startTransition(async () => {
      await closeScanSession(session.id);
      setSession(null);
      setScanCount(0);
    });
  }, [session]);

  useEffect(() => {
    return () => {
      if (session) {
        closeScanSession(session.id).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = useCallback(() => {
    if (!session) return;
    navigator.clipboard.writeText(session.pairingCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [session]);

  const pairUrl = session
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/scan?code=${session.pairingCode}`
    : "";

  if (!session) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bpm-100">
          <Smartphone className="h-6 w-6 text-bpm-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Pair a mobile scanner</p>
          <p className="text-xs text-gray-500 mt-1">
            Open the scanner on your phone to scan QR codes remotely.
            Results appear here in real time.
          </p>
        </div>
        <Button
          onClick={handleCreate}
          disabled={isPending}
          variant="outline"
          className="mx-auto"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4 mr-1.5" />
              Start pairing
            </>
          )}
        </Button>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50/50 p-4 space-y-4">
      {/* Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-green-800">
            Pairing session active
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClose}
          disabled={isPending}
          className="text-gray-500 hover:text-red-600"
        >
          <Link2Off className="h-4 w-4 mr-1" />
          Disconnect
        </Button>
      </div>

      {/* Pairing info — code + QR side by side */}
      <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
            Pairing code
          </p>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold font-mono tracking-widest text-gray-900">
              {session.pairingCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Copy code"
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Enter this code on your phone, or scan the QR →
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-2">
          <QRCodeSVG value={pairUrl} size={100} level="M" />
        </div>
      </div>

      {/* Scan counter */}
      {scanCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-green-700">
          <Check className="h-3.5 w-3.5" />
          <span>{scanCount} scan{scanCount !== 1 ? "s" : ""} received</span>
        </div>
      )}
    </div>
  );
}
