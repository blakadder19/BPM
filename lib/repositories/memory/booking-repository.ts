import { getBookingService } from "@/lib/services/booking-store";
import type { IBookingRepository } from "../interfaces/booking-repository";

export const memoryBookingRepo: IBookingRepository = {
  getService: () => getBookingService(),
};
