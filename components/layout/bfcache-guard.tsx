"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Forces a server refresh when a page is restored from the browser's
 * Back-Forward Cache (BFCache). Without this, stale cached pages can
 * appear momentarily before the server-side route guard kicks in.
 */
export function BFCacheGuard() {
  const router = useRouter();

  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        router.refresh();
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  return null;
}
