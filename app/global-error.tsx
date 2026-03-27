"use client";

/**
 * Root-level error boundary — catches errors that escape the nested
 * app/(app)/error.tsx, including layout-level crashes.
 *
 * Must render its own <html>/<body> since the root layout may have
 * failed to render.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError =
    error.name === "ChunkLoadError" ||
    error.message?.includes("Loading chunk") ||
    error.message?.includes("Failed to fetch dynamically imported module");

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#f9fafb",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 420 }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827" }}>
            Something went wrong
          </h2>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#6b7280",
            }}
          >
            {isChunkError
              ? "A newer version of the app is available. Reloading will fix this."
              : "An unexpected error occurred. Please try again."}
          </p>
          <button
            onClick={() =>
              isChunkError ? window.location.reload() : reset()
            }
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#fff",
              backgroundColor: "#4f46e5",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            {isChunkError ? "Reload page" : "Try again"}
          </button>
        </div>
      </body>
    </html>
  );
}
