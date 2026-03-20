"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Prevents stale protected-page content from being visible when the
 * browser restores a page from BFCache (e.g. after logout + back button).
 *
 * On BFCache restore (`pageshow` with `persisted === true`):
 *  1. Immediately hides the page to prevent the stale flash.
 *  2. Triggers a server refresh which re-runs route guards.
 *  3. If unauthenticated, the server redirect to /login fires.
 *  4. If still authenticated, content re-renders normally.
 */
export function BFCacheGuard() {
  const router = useRouter();

  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        document.documentElement.style.visibility = "hidden";
        router.refresh();
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  useEffect(() => {
    document.documentElement.style.visibility = "visible";
  });

  return null;
}
