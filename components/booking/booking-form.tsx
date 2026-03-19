"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy booking form — replaced by the dialog-based flow in Phase 2.
 * Kept for backwards compatibility; redirects to /classes.
 */
export function BookingForm() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/classes");
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20 text-sm text-gray-400">
      Redirecting to class browser…
    </div>
  );
}
