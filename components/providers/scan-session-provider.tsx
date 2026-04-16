"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  scanChannelName,
  SCAN_RESULT_EVENT,
  type PairedScanResult,
  type ScanSession,
  type ScanContextType,
} from "@/lib/domain/scan-session";
import {
  createPairedScanSession,
  closeScanSession,
} from "@/lib/actions/paired-scan";

const STORAGE_KEY = "bpm_active_scan_session";

interface ScanSessionContextValue {
  session: ScanSession | null;
  isCreating: boolean;
  lastResult: PairedScanResult | null;
  scanCount: number;
  createSession: (contextType: ScanContextType, contextId?: string) => Promise<void>;
  closeSession: () => Promise<void>;
  clearLastResult: () => void;
}

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);

export function ScanSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<ScanSession | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [lastResult, setLastResult] = useState<PairedScanResult | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as ScanSession;
      if (new Date(parsed.expiresAt) < new Date()) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setSession(parsed);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Manage realtime subscription whenever session changes
  useEffect(() => {
    if (!session) {
      if (channelRef.current) {
        const supabase = createClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const supabase = createClient();
    const channelName = scanChannelName(session.id);
    const channel = supabase.channel(channelName);

    channel
      .on("broadcast", { event: SCAN_RESULT_EVENT }, (payload) => {
        const result = payload.payload as PairedScanResult;
        setLastResult(result);
        setScanCount((c) => c + 1);

        // Auto-navigate to the correct context, landing on the scan result state
        const current = pathnameRef.current;
        if (result.payload.type === "attendance") {
          if (!current.includes("/attendance")) {
            router.push("/attendance?tab=qr");
          }
          // If already on attendance, the QrCheckInPanel useEffect picks up lastResult
        } else if (result.payload.type === "event_reception" && result.contextId) {
          const eventOpsPath = `/events/${result.contextId}/operations`;
          if (!current.includes(eventOpsPath)) {
            router.push(eventOpsPath);
          }
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [session, router]);

  const createSession = useCallback(
    async (contextType: ScanContextType, contextId?: string) => {
      setIsCreating(true);
      try {
        const res = await createPairedScanSession({ contextType, contextId });
        if (res.success && res.session) {
          setSession(res.session);
          setScanCount(0);
          setLastResult(null);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(res.session));
        }
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  const closeSession = useCallback(async () => {
    if (session) {
      await closeScanSession(session.id).catch(() => {});
    }
    setSession(null);
    setScanCount(0);
    setLastResult(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [session]);

  const clearLastResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return (
    <ScanSessionContext.Provider
      value={{
        session,
        isCreating,
        lastResult,
        scanCount,
        createSession,
        closeSession,
        clearLastResult,
      }}
    >
      {children}
    </ScanSessionContext.Provider>
  );
}

export function useScanSession(): ScanSessionContextValue {
  const ctx = useContext(ScanSessionContext);
  if (!ctx) throw new Error("useScanSession must be used within ScanSessionProvider");
  return ctx;
}

/** Safe variant that returns null when outside the provider (e.g. for student pages). */
export function useScanSessionSafe(): ScanSessionContextValue | null {
  return useContext(ScanSessionContext);
}
