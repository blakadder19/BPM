/**
 * Singleton BookingService instance backed by mock data.
 * Uses STORE_VERSION to force re-init when class shape changes while preserving data.
 * In production, replace with Supabase-backed service.
 */

import { BookingService, type ClassSnapshot, type StoredBooking, type StoredWaitlistEntry } from "./booking-service";
import { BOOKABLE_CLASSES, BOOKINGS, WAITLIST_ENTRIES, DANCE_STYLES } from "@/lib/mock-data";
import { generateCheckInToken } from "@/lib/domain/checkin-token";

const STORE_VERSION = 5;

function buildClassSnapshots(): ClassSnapshot[] {
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
  }
  return g.__bpm_bookingSvc;
}
