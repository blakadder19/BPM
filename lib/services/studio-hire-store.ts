/**
 * Singleton StudioHireService instance.
 * Uses globalThis to survive HMR module re-evaluation in Next.js dev.
 * When Supabase is configured, starts empty — hydration fills it.
 */

import {
  StudioHireService,
  type StoredStudioHire,
} from "./studio-hire-service";

const STORE_VERSION = 1;

function hasSupabaseConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function buildEntries(): StoredStudioHire[] {
  if (hasSupabaseConfig()) return [];

  const now = new Date().toISOString();
  return [
    {
      id: "sh-demo-1",
      requesterName: "Maria Gonzalez",
      contactEmail: "maria@example.com",
      contactPhone: "+353 85 123 4567",
      date: "2026-04-10",
      startTime: "18:00",
      endTime: "21:00",
      expectedAttendees: 30,
      bookingType: "private_event",
      isBlockBooking: false,
      blockDetails: null,
      status: "confirmed",
      depositRequiredCents: 15000,
      depositPaidCents: 15000,
      cancellationOutcome: null,
      refundedCents: null,
      cancelledAt: null,
      cancellationNote: null,
      adminNote: "Birthday party — DJ will bring own equipment",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "sh-demo-2",
      requesterName: "James O'Brien",
      contactEmail: "james@dancecrew.ie",
      contactPhone: null,
      date: "2026-04-15",
      startTime: "10:00",
      endTime: "13:00",
      expectedAttendees: 8,
      bookingType: "rehearsal",
      isBlockBooking: true,
      blockDetails: "Every Tuesday for 6 weeks",
      status: "pending",
      depositRequiredCents: 10000,
      depositPaidCents: null,
      cancellationOutcome: null,
      refundedCents: null,
      cancelledAt: null,
      cancellationNote: null,
      adminNote: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "sh-demo-3",
      requesterName: "Sophie Chen",
      contactEmail: "sophie@photostudio.ie",
      contactPhone: "+353 87 999 0001",
      date: "2026-04-20",
      startTime: "14:00",
      endTime: "17:00",
      expectedAttendees: 5,
      bookingType: "photoshoot",
      isBlockBooking: false,
      blockDetails: null,
      status: "enquiry",
      depositRequiredCents: null,
      depositPaidCents: null,
      cancellationOutcome: null,
      refundedCents: null,
      cancelledAt: null,
      cancellationNote: null,
      adminNote: "Needs mirrored wall + good lighting",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

const g = globalThis as unknown as {
  __bpm_studioHireSvc?: StudioHireService;
  __bpm_studioHireSvcV?: number;
};

export function getStudioHireService(): StudioHireService {
  if (
    !g.__bpm_studioHireSvc ||
    g.__bpm_studioHireSvcV !== STORE_VERSION
  ) {
    const existing = g.__bpm_studioHireSvc?.entries;
    g.__bpm_studioHireSvc = new StudioHireService(
      existing ?? buildEntries()
    );
    g.__bpm_studioHireSvcV = STORE_VERSION;
  }
  return g.__bpm_studioHireSvc;
}
