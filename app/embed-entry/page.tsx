import type { Metadata } from "next";
import { CalendarPlus, LogIn, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "BPM — Book Your Classes",
  description: "Balance Power Motion dance academy booking system",
};

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://book.balancepowermotion.com";

export default function EmbedEntryPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bpm-auth-bg px-4 py-8">
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="pt-10 pb-8">
          <div className="flex flex-col items-center text-center">
            <img
              src="/branding/bpm-logo-full.jpg"
              alt="BPM — Balance Power Motion"
              className="h-20 w-auto object-contain"
            />

            <h1 className="mt-5 font-display text-xl font-bold text-gray-900">
              Book your classes
            </h1>
            <p className="mt-1.5 text-sm text-gray-500 max-w-[260px]">
              Browse the schedule, grab a spot, and manage your bookings.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <a
              href={`${APP_ORIGIN}/classes`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-bpm-600 to-bpm-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-shadow hover:shadow-md active:shadow-sm"
            >
              <CalendarPlus className="h-4 w-4" />
              Open booking system
            </a>

            <a
              href={`${APP_ORIGIN}/login`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <LogIn className="h-4 w-4 text-gray-500" />
              Log in
            </a>
          </div>

          <p className="mt-5 text-center text-xs text-gray-400">
            New here?{" "}
            <a
              href={`${APP_ORIGIN}/classes`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-bpm-600 hover:text-bpm-700"
            >
              Explore classes first
              <ArrowRight className="ml-0.5 inline h-3 w-3" />
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
