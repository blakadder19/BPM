"use client";

import { Suspense } from "react";
import { BookingForm } from "@/components/booking/booking-form";

function BookingFormFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-gray-400">
      Loading booking form…
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense fallback={<BookingFormFallback />}>
      <BookingForm />
    </Suspense>
  );
}
