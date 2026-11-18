"use client";

import { useEffect, useRef, useState } from "react";

type View = "opening" | "missing" | "unavailable";

/**
 * Reads the receipt token from the URL fragment, removes it from the
 * address bar and history, and posts it to `/receipt/open`. The PDF is an
 * attachment, so a successful post downloads without leaving this page.
 */
export function GuestReceiptOpener({ unavailable }: { unavailable: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<string | null>(null);
  const [view, setView] = useState<View>(unavailable ? "unavailable" : "opening");

  function postToken() {
    const input = tokenInputRef.current;
    if (!input || !tokenRef.current) return;
    input.value = tokenRef.current;
    formRef.current?.submit();
    // submit() captures the form data synchronously; the token stays out of the DOM.
    input.value = "";
  }

  useEffect(() => {
    if (unavailable) return;
    const token = window.location.hash.slice(1);
    if (!token) {
      if (!tokenRef.current) setView("missing");
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    tokenRef.current = token;
    postToken();
  }, [unavailable]);

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center space-y-3">
      <h1 className="text-lg font-semibold text-gray-900">Payment receipt</h1>
      {view === "opening" && (
        <form
          ref={formRef}
          method="post"
          action="/receipt/open"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            postToken();
          }}
        >
          <input ref={tokenInputRef} type="hidden" name="token" />
          <p className="text-sm text-gray-600">Your receipt (PDF) should start downloading.</p>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Download receipt
          </button>
        </form>
      )}
      {view === "missing" && (
        <p className="text-sm text-gray-600">
          Open the receipt link from your email again to download your receipt.
        </p>
      )}
      {view === "unavailable" && (
        <p className="text-sm text-gray-600">
          This receipt link is no longer valid. It may have been replaced by a newer link. Please
          contact the academy for a new receipt.
        </p>
      )}
    </div>
  );
}
