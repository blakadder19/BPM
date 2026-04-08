"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, FlipHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrScannerProps {
  onScan: (code: string) => void;
  active: boolean;
}

const SCANNER_ELEMENT_ID = "bpm-qr-reader";

export function QrScanner({ onScan, active }: QrScannerProps) {
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const disposedRef = useRef(false);
  const startingRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const lastScanned = useRef<string>("");
  const lastScanTime = useRef(0);

  const handleScan = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      if (decodedText === lastScanned.current && now - lastScanTime.current < 1000) {
        return;
      }
      lastScanned.current = decodedText;
      lastScanTime.current = now;
      onScan(decodedText);
    },
    [onScan]
  );

  const stopScanner = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    startingRef.current = false;
    setScanning(false);

    if (!instance) return;

    try {
      const state = instance.getState();
      if (state === 2 /* SCANNING */ || state === 3 /* PAUSED */) {
        await instance.stop();
      }
    } catch {
      // stop() can throw if already stopped or DOM is gone — safe to ignore
    }

    // clear() calls removeChild; skip if the DOM element is already gone
    try {
      if (document.getElementById(SCANNER_ELEMENT_ID)) {
        instance.clear();
      }
    } catch {
      // DOM already removed by React unmount — safe to ignore
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (startingRef.current || scannerRef.current || disposedRef.current) return;
    startingRef.current = true;
    setError(null);

    try {
      const el = document.getElementById(SCANNER_ELEMENT_ID);
      if (!el || disposedRef.current) {
        startingRef.current = false;
        return;
      }

      const { Html5Qrcode } = await import("html5-qrcode");
      if (disposedRef.current) {
        startingRef.current = false;
        return;
      }

      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);

      await scanner.start(
        { facingMode },
        {
          fps: 20,
          qrbox: { width: 200, height: 200 },
          aspectRatio: 1,
          disableFlip: false,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        } as Parameters<typeof scanner.start>[1],
        handleScan,
        () => {}
      );

      if (disposedRef.current) {
        try { await scanner.stop(); } catch { /* noop */ }
        try { scanner.clear(); } catch { /* noop */ }
        startingRef.current = false;
        return;
      }

      scannerRef.current = scanner;
      startingRef.current = false;
      setScanning(true);
    } catch (err: unknown) {
      startingRef.current = false;
      if (disposedRef.current) return;

      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("NotAllowedError") || message.includes("Permission")) {
        setError("Camera access was denied. Please allow camera access in your browser settings.");
      } else if (message.includes("NotFoundError") || message.includes("NotReadableError")) {
        setError("No camera found on this device.");
      } else {
        setError(`Camera error: ${message}`);
      }
      setScanning(false);
    }
  }, [facingMode, handleScan]);

  useEffect(() => {
    disposedRef.current = false;

    if (active) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      disposedRef.current = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, facingMode]);

  async function toggleCamera() {
    await stopScanner();
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-[320px] aspect-square overflow-hidden rounded-2xl bg-gray-900">
        <div
          id={SCANNER_ELEMENT_ID}
          className="[&>video]:object-cover [&>video]:w-full [&>video]:h-full [&_img]:mx-auto"
          style={{ width: "100%", height: "100%" }}
        />
        {!scanning && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Camera className="h-10 w-10" />
            <p className="text-sm">Starting camera…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <CameraOff className="h-10 w-10 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
            <Button size="sm" variant="outline" onClick={startScanner} className="text-white border-white/30 hover:bg-white/10">
              Retry
            </Button>
          </div>
        )}
      </div>

      {scanning && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={toggleCamera}
            className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
            Flip camera
          </button>
        </div>
      )}
    </div>
  );
}
