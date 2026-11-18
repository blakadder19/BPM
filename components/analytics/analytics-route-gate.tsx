"use client";

import { usePathname } from "next/navigation";
import { isAnalyticsExcludedPath } from "@/lib/analytics/tracking";

export function AnalyticsRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAnalyticsExcludedPath(pathname)) return null;
  return <>{children}</>;
}
