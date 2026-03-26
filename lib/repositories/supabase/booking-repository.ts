/**
 * Supabase-backed BookingRepository.
 *
 * Bookings use the operational-persistence + hydration pattern:
 * data is loaded from op_bookings / op_waitlist into the in-memory
 * BookingService on first access, and mutations are written through
 * to Supabase via saveBookingToDB / deleteBookingFromDB in server actions.
 *
 * This repo returns the hydrated in-memory service so that
 * DATA_PROVIDER=supabase resolves correctly.
 */

import type { IBookingRepository } from "../interfaces/booking-repository";
import type { BookingService } from "@/lib/services/booking-service";
import { getBookingService } from "@/lib/services/booking-store";

export const supabaseBookingRepo: IBookingRepository = {
  getService(): BookingService {
    return getBookingService();
  },
};
