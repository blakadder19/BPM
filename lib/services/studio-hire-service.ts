/**
 * Studio Hire service — manages studio hire enquiries and bookings.
 *
 * In-memory store for MVP. The data shape is designed so deposit tracking
 * and cancellation policy logic can be layered on without restructuring.
 */

import type {
  StudioHireStatus,
  StudioHireBookingType,
  StudioHireCancellationOutcome,
} from "@/types/domain";
import { generateId } from "@/lib/utils";

export interface StoredStudioHire {
  id: string;
  requesterName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  date: string;
  startTime: string;
  endTime: string;
  expectedAttendees: number | null;
  bookingType: StudioHireBookingType;
  isBlockBooking: boolean;
  blockDetails: string | null;
  status: StudioHireStatus;
  depositRequiredCents: number | null;
  depositPaidCents: number | null;
  cancellationOutcome: StudioHireCancellationOutcome | null;
  refundedCents: number | null;
  cancelledAt: string | null;
  cancellationNote: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StudioHirePatch = Partial<
  Omit<StoredStudioHire, "id" | "createdAt">
>;

export class StudioHireService {
  entries: StoredStudioHire[];

  constructor(initial: StoredStudioHire[] = []) {
    this.entries = [...initial];
  }

  getAll(): StoredStudioHire[] {
    return [...this.entries].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt)
    );
  }

  getById(id: string): StoredStudioHire | undefined {
    return this.entries.find((e) => e.id === id);
  }

  create(
    data: Omit<StoredStudioHire, "id" | "createdAt" | "updatedAt">
  ): StoredStudioHire {
    const now = new Date().toISOString();
    const entry: StoredStudioHire = {
      ...data,
      id: generateId("sh"),
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(entry);
    return entry;
  }

  update(id: string, patch: StudioHirePatch): StoredStudioHire | null {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const updated: StoredStudioHire = {
      ...this.entries[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.entries[idx] = updated;
    return updated;
  }

  delete(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this.entries.splice(idx, 1);
    return true;
  }
}
