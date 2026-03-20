"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "bpm-dev-unlocked";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalHost(): boolean {
  if (typeof window === "undefined") return false;
  return LOCAL_HOSTS.has(window.location.hostname);
}

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Centralized client-side gate for dev-tools visibility.
 *
 * Rules:
 *  1. Production → always locked, no unlock possible.
 *  2. Non-localhost (LAN IP, etc.) → always locked even in development.
 *  3. localhost + development → locked by default. Unlock via Cmd/Ctrl+Shift+D
 *     which toggles a localStorage flag.
 *
 * Returns `{ unlocked, canUnlock }`.
 *  - `unlocked`: true when tools should be visible.
 *  - `canUnlock`: true when the environment permits toggling (dev + localhost).
 */
export function useDevUnlock() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!IS_DEV || !isLocalHost()) return;

    setUnlocked(localStorage.getItem(STORAGE_KEY) === "1");

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        setUnlocked((prev) => {
          const next = !prev;
          if (next) {
            localStorage.setItem(STORAGE_KEY, "1");
            // eslint-disable-next-line no-console
            console.log("[BPM] Dev tools unlocked. Press Cmd/Ctrl+Shift+D again to lock.");
          } else {
            localStorage.removeItem(STORAGE_KEY);
            // eslint-disable-next-line no-console
            console.log("[BPM] Dev tools locked.");
          }
          return next;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const canUnlock = IS_DEV && (typeof window === "undefined" || isLocalHost());

  return { unlocked: IS_DEV && unlocked, canUnlock };
}
