/**
 * Booking repository interface.
 *
 * Wraps the BookingService orchestration (bookings + waitlist + class snapshots).
 * The in-memory implementation delegates to the existing BookingService class.
 * The Supabase implementation will operate directly against the database.
 */

import type { BookingService } from "@/lib/services/booking-service";

export interface IBookingRepository {
  getService(): BookingService;
}
