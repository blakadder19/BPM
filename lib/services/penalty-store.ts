/**
 * Singleton PenaltyService instance.
 * Uses globalThis to survive HMR module re-evaluation in Next.js dev.
 * When Supabase is configured, starts empty — hydration fills it.
 */

import { PenaltyService, type StoredPenalty } from "./penalty-service";
import { PENALTIES } from "@/lib/mock-data";
import { isSupabaseMode } from "@/lib/config/data-provider";

const STORE_VERSION = 3;

function buildPenalties(): StoredPenalty[] {
  if (isSupabaseMode()) return [];
  return PENALTIES.map((p) => ({
    id: p.id,
    studentId: p.studentId,
    studentName: p.studentName,
    bookingId: p.bookingId,
    bookableClassId: p.bookableClassId,
    classTitle: p.classTitle,
    classDate: p.date,
    reason: p.reason,
    amountCents: p.amountCents,
    resolution: p.resolution,
    subscriptionId: p.subscriptionId,
    creditDeducted: p.creditDeducted,
    createdAt: p.createdAt,
    notes: p.notes ?? null,
  }));
}

const g = globalThis as unknown as {
  __bpm_penaltySvc?: PenaltyService;
  __bpm_penaltySvcV?: number;
};

export function getPenaltyService(): PenaltyService {
  if (!g.__bpm_penaltySvc || g.__bpm_penaltySvcV !== STORE_VERSION) {
    const existing = g.__bpm_penaltySvc?.penalties;
    g.__bpm_penaltySvc = new PenaltyService(existing ?? buildPenalties());
    g.__bpm_penaltySvcV = STORE_VERSION;

    try {
      const { resetHydrationFlags } = require("@/lib/supabase/hydrate-operational");
      resetHydrationFlags();
    } catch { /* hydration module not available */ }
  }
  return g.__bpm_penaltySvc;
}
