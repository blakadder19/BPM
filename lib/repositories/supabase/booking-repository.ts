import type { IBookingRepository } from "../interfaces/booking-repository";

export const supabaseBookingRepo: IBookingRepository = {
  getService() {
    throw new Error(
      "Supabase BookingRepository not yet implemented. " +
      "Set DATA_PROVIDER=memory to use the in-memory booking service."
    );
  },
};
