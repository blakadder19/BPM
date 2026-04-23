"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Truthful laptop receiver registration status, surfaced so the topbar
 * QR helper can reflect REAL state instead of an optimistic "ready" string.
 *
 * States:
 *  - "idle"        : not applicable (e.g., student role, or /scan page)
 *  - "connecting"  : registration in flight
 *  - "ready"       : registration confirmed + heartbeat succeeding
 *  - "error"       : registration or heartbeat failed; see errorMessage
 */
export type ScanReceiverStatus = "idle" | "connecting" | "ready" | "error";

interface ScanReceiverStatusContextValue {
  status: ScanReceiverStatus;
  errorMessage: string | null;
  receiverId: string | null;
  lastUpdatedAt: number | null;
  setStatus: (next: ScanReceiverStatus, opts?: { errorMessage?: string | null; receiverId?: string | null }) => void;
}

const ScanReceiverStatusContext = createContext<ScanReceiverStatusContextValue | null>(null);

export function ScanReceiverStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<ScanReceiverStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const setStatus = useCallback<ScanReceiverStatusContextValue["setStatus"]>((next, opts) => {
    setStatusState(next);
    setErrorMessage(opts?.errorMessage ?? null);
    if (opts && "receiverId" in opts) {
      setReceiverId(opts.receiverId ?? null);
    }
    setLastUpdatedAt(Date.now());
  }, []);

  const value = useMemo<ScanReceiverStatusContextValue>(
    () => ({ status, errorMessage, receiverId, lastUpdatedAt, setStatus }),
    [status, errorMessage, receiverId, lastUpdatedAt, setStatus],
  );

  return (
    <ScanReceiverStatusContext.Provider value={value}>{children}</ScanReceiverStatusContext.Provider>
  );
}

/**
 * Consumer hook. Returns a safe idle default if the provider is not mounted
 * (e.g., on the public marketing shell), so callers can render unconditionally.
 */
export function useScanReceiverStatus(): ScanReceiverStatusContextValue {
  const ctx = useContext(ScanReceiverStatusContext);
  if (ctx) return ctx;
  return {
    status: "idle",
    errorMessage: null,
    receiverId: null,
    lastUpdatedAt: null,
    setStatus: () => {},
  };
}
