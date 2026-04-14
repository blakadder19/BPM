"use client";

import Link from "next/link";
import { MapPin, CalendarDays, Star, Ticket, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { MockSpecialEvent, MockEventPurchase } from "@/lib/mock-data";

interface Props {
  events: MockSpecialEvent[];
  purchases: MockEventPurchase[];
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const fmt = (d: Date) => d.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
  const yearFmt = (d: Date) => d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate()) {
    return yearFmt(s);
  }
  return `${fmt(s)} – ${yearFmt(e)}`;
}

export function StudentEvents({ events, purchases }: Props) {
  const purchasedEventIds = new Set(purchases.filter((p) => p.paymentStatus !== "refunded").map((p) => p.eventId));

  return (
    <div className="space-y-5">
      <PageHeader title="Special Events" description="Workshops, socials, bootcamps, and guest artist events" />

      {events.length === 0 ? (
        <EmptyState icon={Sparkles} title="No upcoming events" description="Check back soon — new events will appear here when they're published." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((evt) => {
            const hasPurchase = purchasedEventIds.has(evt.id);
            return (
              <Link
                key={evt.id}
                href={`/events/${evt.id}`}
                className="group rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold text-gray-900 group-hover:text-bpm-700 transition-colors">
                    {evt.title}
                  </h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {evt.isFeatured && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                    {hasPurchase && (
                      <Badge variant="success"><Ticket className="h-3 w-3 mr-0.5" /> Purchased</Badge>
                    )}
                  </div>
                </div>
                {evt.subtitle && (
                  <p className="mt-0.5 text-sm text-gray-500">{evt.subtitle}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                    {formatDateRange(evt.startDate, evt.endDate)}
                  </span>
                  {evt.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      {evt.location}
                    </span>
                  )}
                </div>
                {evt.salesOpen && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-bpm-50 px-2.5 py-0.5 text-xs font-medium text-bpm-700 border border-bpm-200">
                      Tickets available
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
