/**
 * Singleton PenaltyService instance backed by mock data.
 * In production, replace with Supabase-backed service.
 */

import { PenaltyService, type StoredPenalty } from "./penalty-service";
import { PENALTIES } from "@/lib/mock-data";

function buildPenalties(): StoredPenalty[] {
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
  }));
}

let instance: PenaltyService | null = null;

export function getPenaltyService(): PenaltyService {
  if (!instance) {
    instance = new PenaltyService(buildPenalties());
  }
  return instance;
}
