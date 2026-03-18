/**
 * Singleton BookingService instance backed by mock data.
 * In production, replace with Supabase-backed service.
 */

import { BookingService, type ClassSnapshot, type StoredBooking, type StoredWaitlistEntry } from "./booking-service";
import { BOOKABLE_CLASSES, BOOKINGS, WAITLIST_ENTRIES, DANCE_STYLES } from "@/lib/mock-data";

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
    bookedAt: b.bookedAt,
    cancelledAt: null,
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

const g = globalThis as unknown as { __bpm_bookingSvc?: BookingService };

export function getBookingService(): BookingService {
  if (!g.__bpm_bookingSvc) {
    g.__bpm_bookingSvc = new BookingService(
      buildBookings(),
      buildWaitlist(),
      buildClassSnapshots()
    );
  }
  return g.__bpm_bookingSvc;
}
