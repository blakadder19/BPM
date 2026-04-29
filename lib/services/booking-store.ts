/**
 * Singleton BookingService instance.
 * When Supabase is configured, starts empty — hydration fills real data.
 */

import { BookingService, type ClassSnapshot, type StoredBooking, type StoredWaitlistEntry } from "./booking-service";
import { BOOKABLE_CLASSES, BOOKINGS, WAITLIST_ENTRIES, DANCE_STYLES } from "@/lib/mock-data";
import { generateCheckInToken } from "@/lib/domain/checkin-token";
import { isSupabaseMode } from "@/lib/config/data-provider";

const STORE_VERSION = 6;

function buildClassSnapshots(): ClassSnapshot[] {
  if (isSupabaseMode()) return [];
  return BOOKABLE_CLASSES.map((bc) => {
    const style = bc.styleName
      ? DANCE_STYLES.find((s) => s.name === bc.styleName)
      : null;
    return {
      id: bc.id,
      title: bc.title,
      classType: bc.classType,
      styleName: bc.styleName,
      danceStyleRequiresBalance: style?.requiresRoleBalance ?? false,
      status: bc.status,
      date: bc.date,
      startTime: bc.startTime,
      endTime: bc.endTime,
      maxCapacity: bc.maxCapacity,
      leaderCap: bc.leaderCap,
      followerCap: bc.followerCap,
      location: bc.location,
    };
  });
}

function buildBookings(): StoredBooking[] {
  if (isSupabaseMode()) return [];
  return BOOKINGS.map((b) => ({
    id: b.id,
    bookableClassId: b.bookableClassId,
    studentId: b.studentId,
    studentName: b.studentName,
    danceRole: b.danceRole,
    status: b.status,
    source: "subscription" as const,
    subscriptionId: b.subscriptionId ?? null,
    subscriptionName: b.subscriptionName ?? null,
    adminNote: null,
    bookedAt: b.bookedAt,
    cancelledAt: null,
    checkInToken: b.status === "confirmed" || b.status === "checked_in" ? generateCheckInToken() : null,
  }));
}

function buildWaitlist(): StoredWaitlistEntry[] {
  if (isSupabaseMode()) return [];
  return WAITLIST_ENTRIES.map((w) => ({
    id: w.id,
    bookableClassId: w.bookableClassId,
    studentId: w.studentId,
    studentName: w.studentName,
    danceRole: w.danceRole,
    status: w.status,
    position: w.position,
    joinedAt: w.joinedAt,
    promotedAt: null,
    subscriptionId: (w as unknown as { subscriptionId?: string | null }).subscriptionId ?? null,
    subscriptionName: (w as unknown as { subscriptionName?: string | null }).subscriptionName ?? null,
  }));
}

const g = globalThis as unknown as {
  __bpm_bookingSvc?: BookingService;
  __bpm_bookingSvcV?: number;
};

export function getBookingService(): BookingService {
  if (!g.__bpm_bookingSvc || g.__bpm_bookingSvcV !== STORE_VERSION) {
    const existingBookings = g.__bpm_bookingSvc?.bookings;
    const existingWaitlist = g.__bpm_bookingSvc?.waitlist;

    const bookings = existingBookings?.length
      ? existingBookings.map((b) => ({
          ...b,
          source: b.source ?? ("subscription" as const),
          subscriptionId: b.subscriptionId ?? null,
          subscriptionName: b.subscriptionName ?? null,
          adminNote: b.adminNote ?? null,
          checkInToken: b.checkInToken ?? null,
        }))
      : buildBookings();

    const waitlist = existingWaitlist?.length ? existingWaitlist : buildWaitlist();

    g.__bpm_bookingSvc = new BookingService(bookings, waitlist, buildClassSnapshots());
    g.__bpm_bookingSvcV = STORE_VERSION;

    try {
      const { resetHydrationFlags } = require("@/lib/supabase/hydrate-operational");
      resetHydrationFlags();
    } catch { /* hydration module not available */ }
  }
  return g.__bpm_bookingSvc;
}
