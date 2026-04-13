"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Page-level error boundary for the protected app shell.
 *
 * Catches unhandled client errors — including ChunkLoadError after Vercel
 * redeployments, data-driven TypeErrors from null formatting, and
 * hydration mismatches that escalate to thrown errors.
 *
 * For chunk-load failures the most reliable recovery is a hard reload
 * so the browser fetches fresh HTML with correct asset hashes.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BPM] client error caught by error boundary:", error);
  }, [error]);

  const isChunkError =
    error.name === "ChunkLoadError" ||
    error.message?.includes("Loading chunk") ||
    error.message?.includes("Failed to fetch dynamically imported module");

  function handleRetry() {
    if (isChunkError) {
      window.location.reload();
    } else {
      reset();
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-amber-50 p-4">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">
          Something went wrong
        </h2>
        <p className="max-w-md text-sm text-gray-500">
          {isChunkError
            ? "A newer version of the app is available. Reloading will fix this."
            : "An unexpected error occurred. You can try again or refresh the page."}
        </p>
      </div>
      <button
        onClick={handleRetry}
        className="inline-flex items-center gap-2 rounded-lg bg-bpm-600 px-4 py-2 text-sm font-medium text-white hover:bg-bpm-700 transition-colors"
      >
        <RotateCcw className="h-4 w-4" />
        {isChunkError ? "Reload page" : "Try again"}
      </button>
    </div>
  );
}
