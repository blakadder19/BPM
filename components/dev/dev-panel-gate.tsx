"use client";

import { useDevUnlock } from "@/lib/hooks/use-dev-unlock";
import { DevPanel } from "./dev-panel";

interface DevPanelGateProps {
  studentId: string;
  studentName: string;
}

/**
 * Renders the floating DevPanel only when dev tools are explicitly unlocked
 * (development + localhost + keyboard shortcut toggle).
 */
export function DevPanelGate({ studentId, studentName }: DevPanelGateProps) {
  const { unlocked } = useDevUnlock();
  if (!unlocked) return null;
  return <DevPanel studentId={studentId} studentName={studentName} />;
}
